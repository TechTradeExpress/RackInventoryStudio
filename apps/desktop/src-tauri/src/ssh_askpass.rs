//! SSH_ASKPASS integration and SSH diagnostics.
//!
//! # Askpass flow
//!
//! When a Git push/pull requires an SSH key passphrase and no usable agent is
//! available, OpenSSH invokes the binary pointed to by `SSH_ASKPASS` with the
//! prompt string as its first argument. We set `SSH_ASKPASS` to this binary
//! itself and detect the invocation via `RIS_ASKPASS_MODE=1`.
//!
//! The askpass helper (our binary, re-invoked by SSH) connects via localhost
//! TCP to a short-lived server started by the main app before the git command.
//! The main app emits a Tauri event so the frontend can show a modal. The user
//! enters the passphrase; the frontend calls `respond_ssh_passphrase`; the
//! server thread sends the passphrase back to the helper over TCP; the helper
//! prints it to stdout for SSH to consume. The passphrase is never stored.
//!
//! # Security properties
//! - Passphrase is not stored in config, env, logs, files, or CLI args.
//! - IPC bound to 127.0.0.1 only.
//! - Per-operation random token; expires after one use.
//! - Passphrase is redacted from logs before writing.
//! - Timeout (60 s user, 5 min TCP accept) prevents hanging forever.

use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

// ── Constants ─────────────────────────────────────────────────────────────────

/// Time the frontend has to respond to the passphrase prompt.
///
/// 120 seconds gives the user enough time to read the prompt, enter a
/// passphrase, and submit even on a slow machine.  The backend helper has a
/// slightly longer read timeout so it does not close the TCP connection before
/// the user has finished.
const USER_TIMEOUT_SECS: u64 = 120;

/// Maximum time to wait for SSH to call our askpass helper after git starts.
const TCP_ACCEPT_TIMEOUT_SECS: u64 = 300;

/// Maximum number of askpass attempts before failing (prevents infinite loops).
const MAX_ASKPASS_ATTEMPTS: u32 = 3;

// ── Session state ─────────────────────────────────────────────────────────────

/// Tauri managed state for the active askpass session.
pub struct AskpassState {
    inner: Arc<Mutex<Option<AskpassInner>>>,
}

struct AskpassInner {
    session_id: String,
    tx: std::sync::mpsc::SyncSender<Option<String>>,
    attempts: u32,
    cancelled: Arc<AtomicBool>,
}

/// Payload emitted to the frontend when OpenSSH requests a passphrase.
///
/// `session_id` is a hex string so it round-trips through JSON without the
/// precision loss that would occur if a random `u64` were transported as a
/// JavaScript `number` (which has only 53 bits of integer precision).
#[derive(serde::Serialize, Clone)]
pub struct SshPassphraseRequestedPayload {
    pub session_id: String,
    pub prompt: String,
}

/// Payload emitted when the active askpass session ends without a user
/// response (timeout, cancel, or push completion while modal is open).
#[derive(serde::Serialize, Clone)]
pub struct SshPassphraseSessionEndedPayload {
    pub session_id: String,
}

/// Environment variables to set on the git subprocess to enable askpass.
pub struct AskpassEnv {
    pub binary_path: String,
    pub port: u16,
    pub token: String,
    pub session_id: String,
}

impl AskpassState {
    pub fn new() -> Self {
        AskpassState {
            inner: Arc::new(Mutex::new(None)),
        }
    }

    /// Start a new askpass session.
    ///
    /// Binds a TCP listener on a random localhost port, stores the session token,
    /// and spawns a background thread to accept the askpass connection.
    /// Returns env vars to pass to the git subprocess.
    pub fn start_session(&self, app: AppHandle) -> Result<AskpassEnv, String> {
        let binary_path = std::env::current_exe()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_default();

        if binary_path.is_empty() {
            return Err("Cannot determine binary path for askpass helper".to_string());
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .map_err(|e| format!("Failed to bind askpass listener: {e}"))?;
        let port = listener
            .local_addr()
            .map_err(|e| format!("Failed to get local address: {e}"))?
            .port();

        let token = generate_token();
        let session_id = generate_session_id();
        let cancelled = Arc::new(AtomicBool::new(false));
        let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);

        {
            let mut guard = self.inner.lock().unwrap();
            // Cancel any existing session before replacing it.
            if let Some(ref old) = *guard {
                old.cancelled.store(true, Ordering::Relaxed);
                old.tx.try_send(None).ok();
            }
            *guard = Some(AskpassInner {
                session_id: session_id.clone(),
                tx,
                attempts: 0,
                cancelled: Arc::clone(&cancelled),
            });
        }

        let inner_arc = Arc::clone(&self.inner);
        let token_for_thread = token.clone();
        let session_id_for_thread = session_id.clone();
        let cancelled_for_thread = Arc::clone(&cancelled);
        log::info!(
            "askpass: session {} started on port {} (token generated, not logged)",
            session_id,
            port
        );

        std::thread::spawn(move || {
            run_askpass_server(
                listener,
                token_for_thread,
                rx,
                app,
                inner_arc,
                session_id_for_thread,
                cancelled_for_thread,
            );
        });

        Ok(AskpassEnv {
            binary_path,
            port,
            token,
            session_id,
        })
    }

    /// Send a passphrase (or `None` = cancel) to the waiting askpass server thread.
    ///
    /// `session_id` must match the active session.  A mismatch (stale response
    /// from a previously expired session) returns a typed error so the frontend
    /// can show a friendly "request expired, retry Push" message rather than a
    /// confusing raw error string.
    pub fn respond(&self, session_id: &str, passphrase: Option<String>) -> Result<(), String> {
        let guard = self.inner.lock().unwrap();
        match guard.as_ref() {
            Some(inner) => {
                if inner.session_id != session_id {
                    log::warn!(
                        "askpass: respond called with stale session_id {} (active: {})",
                        session_id,
                        inner.session_id
                    );
                    return Err("This SSH passphrase request expired or was replaced. \
                         Please retry Push."
                        .to_string());
                }
                log::info!(
                    "askpass: session {} — passphrase response received",
                    session_id
                );
                inner.tx.send(passphrase).map_err(|_| {
                    "This SSH passphrase request expired or was replaced. \
                     Please retry Push."
                        .to_string()
                })
            }
            None => {
                log::warn!(
                    "askpass: respond called for session_id {} but no session is active",
                    session_id
                );
                Err("This SSH passphrase request expired or was replaced. \
                     Please retry Push."
                    .to_string())
            }
        }
    }

    /// Drop the session after the git operation completes.
    ///
    /// The `session_id` guard prevents an old, timed-out TCP server thread from
    /// clearing a newer session that started after the previous one expired.
    /// Emits `ssh-passphrase-session-ended` so the frontend can close any
    /// still-open passphrase modal gracefully.
    pub fn clear_session(&self, session_id: &str, app: &AppHandle) {
        if self.clear_session_inner(session_id) {
            app.emit(
                "ssh-passphrase-session-ended",
                &SshPassphraseSessionEndedPayload {
                    session_id: session_id.to_string(),
                },
            )
            .ok();
        }
    }

    /// State-only session teardown (no Tauri event).  Used internally and in tests
    /// where an `AppHandle` is not available.  Returns `true` if the session was
    /// actually present and cleared.
    fn clear_session_inner(&self, session_id: &str) -> bool {
        let mut guard = self.inner.lock().unwrap();
        if guard.as_ref().is_some_and(|i| i.session_id == session_id) {
            if let Some(ref inner) = *guard {
                inner.cancelled.store(true, Ordering::Relaxed);
                inner.tx.try_send(None).ok();
            }
            guard.take();
            log::info!("askpass: session {} cleared", session_id);
            true
        } else {
            false
        }
    }
}

// ── Token generation ──────────────────────────────────────────────────────────

fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Generate a session id as a hex string (16 hex chars from 8 random bytes).
///
/// Represented as a string so the full 64 bits of entropy survive the JSON
/// boundary into JavaScript without the precision loss of `number` (which
/// has only 53 bits of integer precision).
fn generate_session_id() -> String {
    let mut bytes = [0u8; 8];
    getrandom::getrandom(&mut bytes).expect("OS CSPRNG unavailable");
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

// ── TCP server (background thread) ───────────────────────────────────────────

fn run_askpass_server(
    listener: TcpListener,
    expected_token: String,
    rx: std::sync::mpsc::Receiver<Option<String>>,
    app: AppHandle,
    state: Arc<Mutex<Option<AskpassInner>>>,
    own_session_id: String,
    cancelled: Arc<AtomicBool>,
) {
    listener.set_nonblocking(true).ok();

    let deadline = Instant::now() + Duration::from_secs(TCP_ACCEPT_TIMEOUT_SECS);

    let stream = loop {
        if cancelled.load(Ordering::Relaxed) {
            break None;
        }
        match listener.accept() {
            Ok((s, _)) => break Some(s),
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if Instant::now() >= deadline {
                    break None;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            Err(_) => break None,
        }
    };

    match &stream {
        Some(_) => log::info!(
            "askpass: session {} — helper connected (SSH invoked askpass binary)",
            own_session_id
        ),
        None if cancelled.load(Ordering::Relaxed) => log::info!(
            "askpass: session {} cancelled before helper connected",
            own_session_id
        ),
        None => log::warn!(
            "askpass: session {} timed out waiting for helper — SSH may not have invoked \
             SSH_ASKPASS (check SSH version supports SSH_ASKPASS_REQUIRE=force)",
            own_session_id
        ),
    }

    if let Some(stream) = stream {
        if let Err(e) =
            handle_askpass_connection(stream, &expected_token, &rx, &app, &state, &own_session_id)
        {
            // Redact: never log passphrase. Log only structural errors.
            log::warn!(
                "askpass session {} error (passphrase not logged): {e}",
                own_session_id
            );
        }
    }
    log::info!("askpass: session {} helper thread finished", own_session_id);

    // Only clear if this thread still owns the current session.
    // A newer session may have started after a previous operation timed out.
    {
        let mut guard = state.lock().unwrap();
        if guard
            .as_ref()
            .is_some_and(|i| i.session_id == own_session_id)
        {
            guard.take();
        }
    }
}

fn handle_askpass_connection(
    stream: TcpStream,
    expected_token: &str,
    rx: &std::sync::mpsc::Receiver<Option<String>>,
    app: &AppHandle,
    state: &Arc<Mutex<Option<AskpassInner>>>,
    session_id: &str,
) -> Result<(), String> {
    stream.set_read_timeout(Some(Duration::from_secs(10))).ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();
    let mut write_stream = stream
        .try_clone()
        .map_err(|e| format!("clone TCP stream: {e}"))?;

    let mut reader = BufReader::new(stream);

    let mut token_line = String::new();
    reader
        .read_line(&mut token_line)
        .map_err(|e| format!("read token: {e}"))?;
    let token = token_line.trim_end_matches(['\r', '\n']).to_string();

    let mut prompt_line = String::new();
    reader
        .read_line(&mut prompt_line)
        .map_err(|e| format!("read prompt: {e}"))?;
    let prompt = prompt_line.trim_end_matches(['\r', '\n']).to_string();

    // Validate token — reject connections with the wrong token.
    if token != expected_token {
        write_stream.write_all(b"CANCEL\n").ok();
        // Do NOT log the received or expected token values.
        return Err("Invalid token in askpass connection — rejecting".to_string());
    }
    log::info!("askpass: session {} — helper token accepted", session_id);

    // Check attempt limit to prevent infinite passphrase loops.
    let at_limit = {
        let mut guard = state.lock().unwrap();
        if let Some(inner) = guard.as_mut() {
            inner.attempts += 1;
            inner.attempts > MAX_ASKPASS_ATTEMPTS
        } else {
            true
        }
    };
    if at_limit {
        write_stream.write_all(b"CANCEL\n").ok();
        return Err(format!(
            "Askpass attempt limit ({MAX_ASKPASS_ATTEMPTS}) reached — aborting"
        ));
    }

    let safe_prompt = sanitize_prompt(&prompt);
    log::info!(
        "askpass: session {} — prompt received, emitting request to frontend",
        session_id
    );

    // Emit event to frontend — frontend shows the passphrase modal.
    // The payload includes session_id so the frontend can correlate the
    // response and handle session expiry correctly.
    let payload = SshPassphraseRequestedPayload {
        session_id: session_id.to_string(),
        prompt: safe_prompt,
    };
    if let Err(e) = app.emit("ssh-passphrase-requested", &payload) {
        write_stream.write_all(b"CANCEL\n").ok();
        return Err(format!("Failed to emit passphrase event to frontend: {e}"));
    }
    log::info!(
        "askpass: session {} — ssh-passphrase-requested emitted to frontend",
        session_id
    );

    // Wait for user response (passphrase or cancel). None = timeout or cancel.
    let passphrase = rx
        .recv_timeout(Duration::from_secs(USER_TIMEOUT_SECS))
        .ok()
        .flatten();

    if let Some(ref _p) = passphrase {
        // Do NOT log the passphrase value.
        log::info!(
            "askpass: session {} — passphrase received, forwarding to SSH helper",
            session_id
        );
        let response_bytes = format!("OK\n{_p}\n");
        write_stream
            .write_all(response_bytes.as_bytes())
            .map_err(|e| format!("write passphrase to askpass helper: {e}"))?;
    } else {
        log::info!(
            "askpass: session {} — timed out or cancelled, sending CANCEL to helper",
            session_id
        );
        write_stream.write_all(b"CANCEL\n").ok();
        // Notify the frontend so it can close the modal gracefully instead of
        // leaving it open with a stale session.
        app.emit(
            "ssh-passphrase-session-ended",
            &SshPassphraseSessionEndedPayload {
                session_id: session_id.to_string(),
            },
        )
        .ok();
        log::info!(
            "askpass: session {} — ssh-passphrase-session-ended emitted to frontend",
            session_id
        );
    }

    Ok(())
}

fn sanitize_prompt(prompt: &str) -> String {
    let safe: String = prompt
        .chars()
        .filter(|c| c.is_ascii_graphic() || *c == ' ')
        .take(200)
        .collect();
    if safe.trim().is_empty() {
        "Enter SSH key passphrase".to_string()
    } else {
        safe
    }
}

// ── Environment builder ───────────────────────────────────────────────────────

/// Build the list of environment variable pairs to inject into the git subprocess.
///
/// `SSH_ASKPASS_REQUIRE=force` (OpenSSH ≥ 8.4) forces SSH to use the askpass
/// program even without a display, making the prompt unconditional when needed.
/// On Linux we also set DISPLAY=:0 as a fallback for older SSH that requires it.
/// These vars do NOT contain the passphrase.
pub fn build_askpass_env_pairs(env: &AskpassEnv) -> Vec<(String, String)> {
    let mut vars = vec![
        ("SSH_ASKPASS".to_string(), env.binary_path.clone()),
        ("SSH_ASKPASS_REQUIRE".to_string(), "force".to_string()),
        ("RIS_ASKPASS_MODE".to_string(), "1".to_string()),
        ("RIS_ASKPASS_PORT".to_string(), env.port.to_string()),
        ("RIS_ASKPASS_TOKEN".to_string(), env.token.clone()),
    ];
    // Fallback for SSH < 8.4 on Linux/macOS (DISPLAY triggers askpass in older versions).
    #[cfg(not(target_os = "windows"))]
    if std::env::var("DISPLAY").is_err() {
        vars.push(("DISPLAY".to_string(), ":0".to_string()));
    }
    vars
}

// ── Askpass helper mode (invoked by OpenSSH) ──────────────────────────────────

/// Entry point when the binary is invoked by OpenSSH as the SSH_ASKPASS helper.
///
/// Called from `main()` when `RIS_ASKPASS_MODE=1` is set.
/// Returns an exit code: 0 = passphrase printed to stdout, 1 = cancel/error.
/// The passphrase is written only to stdout (as a pipe to SSH), never logged.
///
/// Writes non-secret trace lines to stderr so they appear in git's stderr output
/// and can be correlated with askpass server logs in the main process.
pub fn run_as_askpass() -> i32 {
    eprintln!("[ris-askpass] helper invoked by SSH");

    let prompt = std::env::args().nth(1).unwrap_or_default();

    let port_str = match std::env::var("RIS_ASKPASS_PORT") {
        Ok(p) => p,
        Err(_) => {
            eprintln!("[ris-askpass] RIS_ASKPASS_PORT not set — askpass env not inherited");
            return 1;
        }
    };
    if std::env::var("RIS_ASKPASS_TOKEN").is_err() {
        eprintln!("[ris-askpass] RIS_ASKPASS_TOKEN not set — askpass env not inherited");
        return 1;
    }
    let token = std::env::var("RIS_ASKPASS_TOKEN").unwrap();
    let port: u16 = match port_str.parse() {
        Ok(p) => p,
        Err(_) => {
            eprintln!("[ris-askpass] invalid port value");
            return 1;
        }
    };

    eprintln!("[ris-askpass] connecting to localhost:{port}");
    match connect_and_get_passphrase(port, &token, &prompt) {
        Ok(Some(passphrase)) => {
            eprintln!("[ris-askpass] passphrase received, returning to SSH");
            // Write passphrase to stdout for SSH to consume.
            // Use Write trait directly to avoid platform print! quirks.
            use std::io::Write;
            let mut stdout = std::io::stdout();
            stdout.write_all(passphrase.as_bytes()).ok();
            // SSH expects a newline after the passphrase.
            stdout.write_all(b"\n").ok();
            stdout.flush().ok();
            0
        }
        Ok(None) => {
            eprintln!("[ris-askpass] cancelled by user or timed out");
            1
        }
        Err(e) => {
            // e does not contain the passphrase — safe to log.
            eprintln!("[ris-askpass] connection error: {e}");
            1
        }
    }
}

fn connect_and_get_passphrase(
    port: u16,
    token: &str,
    prompt: &str,
) -> Result<Option<String>, String> {
    let addr = format!("127.0.0.1:{port}");
    let mut stream = TcpStream::connect(&addr).map_err(|e| format!("connect to {addr}: {e}"))?;

    // Give the user slightly longer than the server timeout.
    stream
        .set_read_timeout(Some(Duration::from_secs(USER_TIMEOUT_SECS + 10)))
        .ok();
    stream.set_write_timeout(Some(Duration::from_secs(10))).ok();

    // Send: "token\nprompt\n"
    let msg = format!("{token}\n{prompt}\n");
    stream
        .write_all(msg.as_bytes())
        .map_err(|e| format!("send token+prompt: {e}"))?;

    // Read response: "OK\n{passphrase}\n" or "CANCEL\n"
    let mut reader = BufReader::new(&stream);
    let mut status_line = String::new();
    reader
        .read_line(&mut status_line)
        .map_err(|e| format!("read status: {e}"))?;
    let status = status_line.trim_end_matches(['\r', '\n']);

    if status == "CANCEL" {
        return Ok(None);
    }
    if status == "OK" {
        let mut passphrase_line = String::new();
        reader
            .read_line(&mut passphrase_line)
            .map_err(|e| format!("read passphrase: {e}"))?;
        // Strip trailing newline only — not other whitespace (passphrase could have spaces).
        let passphrase = passphrase_line.trim_end_matches(['\r', '\n']).to_string();
        return Ok(Some(passphrase));
    }

    Err(format!("Unexpected response from askpass server: {status}"))
}

// ── SSH diagnostics ───────────────────────────────────────────────────────────

/// Outcome of running `ssh-add -l`.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshAddStatus {
    /// Agent is running and has at least one identity loaded.
    HasIdentities(usize),
    /// Agent is running but has no identities.
    NoIdentities,
    /// Agent is not reachable (SSH_AUTH_SOCK missing or connection refused).
    AgentUnreachable,
    /// `ssh-add` command is not available in PATH.
    CommandUnavailable,
    /// Status could not be determined.
    Unknown,
}

/// User-facing guidance strings for common SSH states.
pub fn ssh_agent_guidance(
    add_status: &SshAddStatus,
    remote_is_ssh: bool,
    ssh_command: Option<&str>,
) -> Vec<String> {
    let mut hints: Vec<String> = Vec::new();

    if !remote_is_ssh {
        return hints;
    }

    match add_status {
        SshAddStatus::HasIdentities(n) => {
            hints.push(format!(
                "SSH agent has {n} key(s) loaded. If push/pull still fails, the required \
                 key may not be among them, or Git may be using a different SSH \
                 configuration than the agent expects."
            ));
        }
        SshAddStatus::NoIdentities => {
            hints.push("ssh-agent is reachable but has no identities. Run: ssh-add ~/.ssh/id_ed25519 (or your key path)".to_string());
        }
        SshAddStatus::AgentUnreachable => {
            hints.push(
                "No SSH agent detected (SSH_AUTH_SOCK not set or agent not running).".to_string(),
            );
            #[cfg(target_os = "windows")]
            hints.push("On Windows: enable the OpenSSH Authentication Agent service in Services → set to Automatic, then start it. Then run: ssh-add".to_string());
            #[cfg(not(target_os = "windows"))]
            hints.push("On Linux/macOS: start the agent with eval $(ssh-agent -s) then run: ssh-add ~/.ssh/id_ed25519".to_string());
        }
        SshAddStatus::CommandUnavailable => {
            hints.push("ssh-add is not available — install OpenSSH client.".to_string());
        }
        SshAddStatus::Unknown => {}
    }

    // Windows: detect likely Git-for-Windows SSH vs Windows OpenSSH mismatch.
    #[cfg(target_os = "windows")]
    {
        let uses_system_ssh = ssh_command
            .map(|c| {
                let lower = c.to_ascii_lowercase();
                lower.contains("openssh") || lower.contains("system32")
            })
            .unwrap_or(false);
        let no_override = ssh_command.is_none();
        if no_override || !uses_system_ssh {
            hints.push(
                "If Git is using its own bundled SSH instead of Windows OpenSSH, add/load your key may not reach the Windows agent. \
                 To fix: git config --global core.sshCommand \"C:/Windows/System32/OpenSSH/ssh.exe\""
                    .to_string(),
            );
        }
    }
    #[cfg(not(target_os = "windows"))]
    let _ = ssh_command;

    hints
}

/// Run an external command with a timeout, returning stdout+stderr on success.
fn run_with_timeout(cmd: &mut Command, timeout: Duration) -> Option<std::process::Output> {
    let start = Instant::now();
    match cmd.spawn() {
        Err(_) => None,
        Ok(mut child) => loop {
            if start.elapsed() >= timeout {
                child.kill().ok();
                return None;
            }
            match child.try_wait() {
                Ok(Some(_)) => return child.wait_with_output().ok(),
                Ok(None) => std::thread::sleep(Duration::from_millis(100)),
                Err(_) => return None,
            }
        },
    }
}

/// Probe `ssh-add -l` and classify the result.
pub fn probe_ssh_add() -> SshAddStatus {
    let timeout = Duration::from_secs(3);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("ssh-add");
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new("ssh-add");

    cmd.arg("-l")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let output = match run_with_timeout(&mut cmd, timeout) {
        None => return SshAddStatus::CommandUnavailable,
        Some(o) => o,
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined = format!("{stdout}{stderr}").to_ascii_lowercase();

    if combined.contains("the agent has no identities")
        || combined.contains("agent has no identities")
        || combined.contains("no identities")
    {
        return SshAddStatus::NoIdentities;
    }
    if combined.contains("could not open")
        || combined.contains("error connecting")
        || combined.contains("no such file")
        || combined.contains("connection refused")
    {
        return SshAddStatus::AgentUnreachable;
    }
    if combined.is_empty() && !output.status.success() {
        // ssh-add -l exits 2 when agent unreachable on some platforms
        if output.status.code() == Some(2) {
            return SshAddStatus::AgentUnreachable;
        }
        return SshAddStatus::Unknown;
    }
    // Count lines that look like identities (e.g. "256 SHA256:... user@host (ED25519)")
    let identity_count = stdout
        .lines()
        .filter(|l| l.len() > 10 && !l.trim().is_empty())
        .count();
    if identity_count > 0 {
        SshAddStatus::HasIdentities(identity_count)
    } else if output.status.success() {
        SshAddStatus::NoIdentities
    } else {
        SshAddStatus::Unknown
    }
}

/// Detect the ssh executable path.
pub fn find_ssh_executable() -> Option<String> {
    let timeout = Duration::from_secs(3);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("where");
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c.arg("ssh");
        c
    };
    #[cfg(not(windows))]
    let mut cmd = {
        let mut c = Command::new("which");
        c.arg("ssh");
        c
    };

    cmd.stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    run_with_timeout(&mut cmd, timeout).and_then(|o| {
        if o.status.success() {
            let path = String::from_utf8_lossy(&o.stdout)
                .lines()
                .next()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            path
        } else {
            None
        }
    })
}

/// Get the `ssh -V` version string.
pub fn get_ssh_version() -> Option<String> {
    let timeout = Duration::from_secs(3);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("ssh");
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new("ssh");

    cmd.arg("-V")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    run_with_timeout(&mut cmd, timeout).and_then(|o| {
        // `ssh -V` writes to stderr on most implementations.
        let ver = String::from_utf8_lossy(&o.stderr).trim().to_string();
        if !ver.is_empty() {
            Some(ver)
        } else {
            let ver2 = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if ver2.is_empty() {
                None
            } else {
                Some(ver2)
            }
        }
    })
}

/// Get `git config --get core.sshCommand` from the repository path, if configured.
pub fn get_core_ssh_command(repo_path: &Path) -> Option<String> {
    let timeout = Duration::from_secs(3);

    #[cfg(windows)]
    let mut cmd = {
        let mut c = Command::new("git");
        use std::os::windows::process::CommandExt;
        c.creation_flags(0x0800_0000);
        c
    };
    #[cfg(not(windows))]
    let mut cmd = Command::new("git");

    cmd.args(["config", "--get", "core.sshCommand"])
        .current_dir(repo_path)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null());

    run_with_timeout(&mut cmd, timeout).and_then(|o| {
        if o.status.success() {
            let val = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if val.is_empty() {
                None
            } else {
                Some(val)
            }
        } else {
            None
        }
    })
}

// ── Tests ─────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_token_is_non_empty() {
        let t = generate_token();
        assert!(!t.is_empty());
    }

    #[test]
    fn generate_token_is_64_hex_chars() {
        let t = generate_token();
        assert_eq!(
            t.len(),
            64,
            "CSPRNG token should be 64 hex chars (256 bits)"
        );
        assert!(t.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn generate_token_is_unique() {
        let t1 = generate_token();
        let t2 = generate_token();
        assert_ne!(t1, t2, "CSPRNG tokens should be unique");
    }

    #[test]
    fn sanitize_prompt_strips_control_chars() {
        let raw = "Enter passphrase for key '/home/user/.ssh/id_ed25519':\x00\x1b";
        let s = sanitize_prompt(raw);
        assert!(!s.contains('\x00'));
        assert!(!s.contains('\x1b'));
        assert!(s.contains("Enter passphrase"));
    }

    #[test]
    fn sanitize_prompt_empty_becomes_default() {
        let s = sanitize_prompt("");
        assert_eq!(s, "Enter SSH key passphrase");
    }

    #[test]
    fn sanitize_prompt_whitespace_only_becomes_default() {
        let s = sanitize_prompt("   ");
        assert_eq!(s, "Enter SSH key passphrase");
    }

    #[test]
    fn generate_session_id_is_16_hex_chars() {
        let id = generate_session_id();
        assert_eq!(id.len(), 16, "session id should be 16 hex chars (64 bits)");
        assert!(
            id.chars().all(|c| c.is_ascii_hexdigit()),
            "session id should be hex: {id}"
        );
    }

    #[test]
    fn generate_session_id_is_unique() {
        let a = generate_session_id();
        let b = generate_session_id();
        assert_ne!(a, b, "session ids should be unique");
    }

    #[test]
    fn build_askpass_env_pairs_contains_required_keys() {
        let env = AskpassEnv {
            binary_path: "/usr/bin/myapp".to_string(),
            port: 12345,
            token: "abc123".to_string(),
            session_id: "0000000000000001".to_string(),
        };
        let pairs = build_askpass_env_pairs(&env);
        let keys: Vec<&str> = pairs.iter().map(|(k, _)| k.as_str()).collect();
        assert!(keys.contains(&"SSH_ASKPASS"));
        assert!(keys.contains(&"SSH_ASKPASS_REQUIRE"));
        assert!(keys.contains(&"RIS_ASKPASS_MODE"));
        assert!(keys.contains(&"RIS_ASKPASS_PORT"));
        assert!(keys.contains(&"RIS_ASKPASS_TOKEN"));
    }

    #[test]
    fn build_askpass_env_pairs_does_not_contain_passphrase() {
        let env = AskpassEnv {
            binary_path: "/usr/bin/myapp".to_string(),
            port: 12345,
            token: "abc123".to_string(),
            session_id: "0000000000000001".to_string(),
        };
        let pairs = build_askpass_env_pairs(&env);
        // No pair key or value should be named "passphrase" or "password".
        for (k, v) in &pairs {
            let k_lower = k.to_ascii_lowercase();
            let v_lower = v.to_ascii_lowercase();
            assert!(
                !k_lower.contains("passphrase"),
                "key contains passphrase: {k}"
            );
            assert!(!k_lower.contains("password"), "key contains password: {k}");
            assert!(
                !v_lower.contains("passphrase"),
                "value contains passphrase: {v}"
            );
            assert!(
                !v_lower.contains("password"),
                "value contains password: {v}"
            );
        }
    }

    #[test]
    fn respond_fails_when_no_session() {
        let state = AskpassState::new();
        let result = state.respond("aabbccddeeff0011", Some("secret".to_string()));
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("expired"),
            "error message should mention expiry"
        );
    }

    #[test]
    fn respond_fails_with_wrong_session_id() {
        let (tx, _rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
        let state = AskpassState::new();
        {
            let mut guard = state.inner.lock().unwrap();
            *guard = Some(AskpassInner {
                session_id: "aabbccdd11223344".to_string(),
                tx,
                attempts: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        let result = state.respond("deadbeefcafebabe", Some("secret".to_string()));
        assert!(result.is_err());
        assert!(
            result.unwrap_err().contains("expired"),
            "wrong session_id should return expiry message"
        );
    }

    /// Regression: a high-entropy hex session id (that would be unrepresentable
    /// as a JS number) round-trips through string comparison without precision loss.
    #[test]
    fn respond_high_entropy_session_id_is_not_truncated() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
        let state = AskpassState::new();
        // This value exceeds Number.MAX_SAFE_INTEGER (2^53-1) — it would be rounded
        // if transported as a JS number.
        let high_entropy_id = "ffffffffffffffff".to_string();
        {
            let mut guard = state.inner.lock().unwrap();
            *guard = Some(AskpassInner {
                session_id: high_entropy_id.clone(),
                tx,
                attempts: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        let result = state.respond(&high_entropy_id, Some("passphrase".to_string()));
        assert!(result.is_ok(), "high-entropy session id must match exactly");
        let received = rx.recv_timeout(std::time::Duration::from_millis(100));
        assert_eq!(received.unwrap(), Some("passphrase".to_string()));
    }

    #[test]
    fn respond_succeeds_with_correct_session_id() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
        let state = AskpassState::new();
        {
            let mut guard = state.inner.lock().unwrap();
            *guard = Some(AskpassInner {
                session_id: "0102030405060708".to_string(),
                tx,
                attempts: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        let result = state.respond("0102030405060708", Some("correct-passphrase".to_string()));
        assert!(result.is_ok());
        let received = rx.recv_timeout(std::time::Duration::from_millis(100));
        assert_eq!(received.unwrap(), Some("correct-passphrase".to_string()));
    }

    #[test]
    fn respond_cancel_with_correct_session_id() {
        let (tx, rx) = std::sync::mpsc::sync_channel::<Option<String>>(1);
        let state = AskpassState::new();
        {
            let mut guard = state.inner.lock().unwrap();
            *guard = Some(AskpassInner {
                session_id: "0706050403020100".to_string(),
                tx,
                attempts: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        let result = state.respond("0706050403020100", None);
        assert!(result.is_ok());
        let received = rx.recv_timeout(std::time::Duration::from_millis(100));
        assert_eq!(received.unwrap(), None);
    }

    #[test]
    fn askpass_session_lifecycle_no_session() {
        let state = AskpassState::new();
        assert!(state.inner.lock().unwrap().is_none());
        assert!(state.respond("0000000000000000", None).is_err());
        // clear_session_inner is a no-op when no session exists
        assert!(!state.clear_session_inner("0000000000000000"));
        assert!(state.inner.lock().unwrap().is_none());
    }

    #[test]
    fn clear_session_inner_wrong_id_does_not_clear() {
        let (tx, _rx) = std::sync::mpsc::sync_channel(1);
        let state = AskpassState::new();
        {
            let mut guard = state.inner.lock().unwrap();
            *guard = Some(AskpassInner {
                session_id: "aabbccddeeff0011".to_string(),
                tx,
                attempts: 0,
                cancelled: Arc::new(AtomicBool::new(false)),
            });
        }
        // Wrong session_id — should be a no-op.
        assert!(!state.clear_session_inner("1122334455667788"));
        assert!(
            state.inner.lock().unwrap().is_some(),
            "session should still exist after wrong id"
        );
        // Correct session_id — should clear.
        assert!(state.clear_session_inner("aabbccddeeff0011"));
        assert!(
            state.inner.lock().unwrap().is_none(),
            "session should be cleared after correct id"
        );
    }

    #[test]
    fn tcp_roundtrip_passphrase() {
        // Spin up a listener, connect as the askpass helper, verify the protocol.
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "test-token-roundtrip".to_string();
        let token_clone = token.clone();
        let expected_passphrase = "super-secret-123".to_string();
        let expected_clone = expected_passphrase.clone();

        // Server thread: accept one connection, send passphrase.
        let server = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            let mut write_stream = stream.try_clone().unwrap();
            let mut reader = BufReader::new(&stream);

            let mut token_line = String::new();
            reader.read_line(&mut token_line).unwrap();
            assert_eq!(token_line.trim_end_matches(['\r', '\n']), token_clone);

            let mut _prompt_line = String::new();
            reader.read_line(&mut _prompt_line).unwrap();

            let response = format!("OK\n{expected_clone}\n");
            write_stream.write_all(response.as_bytes()).unwrap();
        });

        // Client (askpass helper role).
        let result = connect_and_get_passphrase(port, &token, "Enter passphrase:");
        server.join().unwrap();

        assert_eq!(result.unwrap(), Some(expected_passphrase));
    }

    #[test]
    fn tcp_roundtrip_cancel() {
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let token = "test-token-cancel".to_string();
        let token_clone = token.clone();

        let server = thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut reader = BufReader::new(&stream);
            let mut _line = String::new();
            reader.read_line(&mut _line).unwrap();
            let mut _line2 = String::new();
            reader.read_line(&mut _line2).unwrap();
            stream.write_all(b"CANCEL\n").unwrap();
        });

        let result = connect_and_get_passphrase(port, &token_clone, "Enter passphrase:");
        server.join().unwrap();

        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn tcp_roundtrip_wrong_token_rejected() {
        use std::thread;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();

        // Server sends CANCEL for any request (simulates token mismatch handling).
        let server = thread::spawn(move || {
            if let Ok((mut stream, _)) = listener.accept() {
                let mut reader = BufReader::new(&stream);
                let mut _line = String::new();
                reader.read_line(&mut _line).unwrap();
                let mut _line2 = String::new();
                reader.read_line(&mut _line2).unwrap();
                // Server rejects wrong token — sends CANCEL.
                stream.write_all(b"CANCEL\n").unwrap();
            }
        });

        let result = connect_and_get_passphrase(port, "wrong-token", "Enter passphrase:");
        server.join().unwrap();
        // Client receives CANCEL → Ok(None).
        assert_eq!(result.unwrap(), None);
    }

    #[test]
    fn ssh_agent_guidance_empty_for_https() {
        let hints = ssh_agent_guidance(&SshAddStatus::AgentUnreachable, false, None);
        assert!(hints.is_empty(), "should produce no hints for HTTPS remote");
    }

    #[test]
    fn ssh_agent_guidance_has_hint_for_no_identities_ssh() {
        let hints = ssh_agent_guidance(&SshAddStatus::NoIdentities, true, None);
        assert!(!hints.is_empty());
        assert!(hints[0].to_ascii_lowercase().contains("ssh-add"));
    }

    #[test]
    fn ssh_agent_guidance_has_hint_for_unreachable_agent() {
        let hints = ssh_agent_guidance(&SshAddStatus::AgentUnreachable, true, None);
        assert!(!hints.is_empty());
    }

    #[test]
    fn ssh_agent_guidance_has_identities_does_not_claim_should_work() {
        // "ssh-agent has identities" is a diagnostic fact, not a guarantee.
        // The hint must not say "should work" because authentication can still
        // fail if the required key is not among the loaded ones.
        let hints = ssh_agent_guidance(&SshAddStatus::HasIdentities(2), true, None);
        assert!(
            !hints.is_empty(),
            "HasIdentities must produce a hint for SSH remotes"
        );
        for hint in &hints {
            assert!(
                !hint.to_ascii_lowercase().contains("should work"),
                "HasIdentities hint must not claim 'should work': {hint}"
            );
        }
    }
}
