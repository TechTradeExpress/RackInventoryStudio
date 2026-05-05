fmt:
	cargo fmt --all

check:
	cargo check --workspace

test:
	cargo test --workspace

lint:
	cargo clippy --workspace -- -D warnings

repomix:
	docker run -v .:/app -it --rm ghcr.io/yamadashy/repomix
