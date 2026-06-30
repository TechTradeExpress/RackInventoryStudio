// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { SearchableSelect } from "./SearchableSelect";

const OPTIONS = [
  { value: "", label: "— none —" },
  {
    value: "a",
    label: "Alpha Server",
    keywords: "dell r750 server",
    meta: "Dell · R750 · server · 2U",
  },
  {
    value: "b",
    label: "Beta Switch",
    keywords: "cisco c9300 network",
    meta: "Cisco · C9300 · network · 1U",
  },
  {
    value: "c",
    label: "Gamma Storage",
    keywords: "hpe dl380 storage",
    meta: "HPE · DL380 · storage · 4U",
  },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SearchableSelect — trigger display", () => {
  it("renders the selected option label in the trigger", () => {
    render(<SearchableSelect options={OPTIONS} value="a" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toContain("Alpha Server");
  });

  it("renders a placeholder when the value does not match any option", () => {
    const opts = OPTIONS.slice(1); // no value="" option
    render(
      <SearchableSelect
        options={opts}
        value=""
        onChange={vi.fn()}
        placeholder="— pick one —"
      />,
    );
    expect(screen.getByRole("button").textContent).toContain("— pick one —");
  });

  it("shows the matching none option label when value is empty string", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button").textContent).toContain("— none —");
  });
});

describe("SearchableSelect — dropdown open/close", () => {
  it("opens the dropdown on trigger click", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("shows all options when opened with no query", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Alpha Server")).toBeTruthy();
    expect(screen.getByText("Beta Switch")).toBeTruthy();
    expect(screen.getByText("Gamma Storage")).toBeTruthy();
  });

  it("closes on second trigger click", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.click(btn);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SearchableSelect — search", () => {
  it("typing in search filters options by label", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "alpha" },
    });
    await waitFor(() => {
      expect(screen.getByText("Alpha Server")).toBeTruthy();
      expect(screen.queryByText("Beta Switch")).toBeNull();
      expect(screen.queryByText("Gamma Storage")).toBeNull();
    });
  });

  it("search is case-insensitive", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "ALPHA" },
    });
    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());
  });

  it("search matches by keywords (vendor, SKU)", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "cisco" },
    });
    await waitFor(() => {
      expect(screen.getByText("Beta Switch")).toBeTruthy();
      expect(screen.queryByText("Alpha Server")).toBeNull();
    });
  });

  it("search ignores leading/trailing whitespace", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "  alpha  " },
    });
    await waitFor(() => expect(screen.getByText("Alpha Server")).toBeTruthy());
  });

  it("shows 'No results' when nothing matches", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "zzz-no-match" },
    });
    await waitFor(() => expect(screen.getByText("No results")).toBeTruthy());
  });
});

describe("SearchableSelect — selection", () => {
  it("clicking an option calls onChange with its value", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(
      screen.getByText("Alpha Server").closest(".ss-option")!,
    );
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("clicking an option closes the dropdown", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(
      screen.getByText("Alpha Server").closest(".ss-option")!,
    );
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("marks the currently selected option with aria-selected", () => {
    render(<SearchableSelect options={OPTIONS} value="b" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    // "Beta Switch" appears in both the trigger and the dropdown option
    const optionEls = screen.getAllByText("Beta Switch");
    const option = optionEls
      .map((el) => el.closest("[role=option]"))
      .find(Boolean) as HTMLElement;
    expect(option.getAttribute("aria-selected")).toBe("true");
  });
});

describe("SearchableSelect — disabled", () => {
  it("disabled trigger cannot be clicked open", () => {
    render(
      <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} disabled />,
    );
    const btn = screen.getByRole("button") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(screen.queryByRole("listbox")).toBeNull();
  });
});

describe("SearchableSelect — structure", () => {
  it("list has the ss-list class for scroll containment", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const list = document.querySelector(".ss-list");
    expect(list).not.toBeNull();
  });

  it("shows meta text below option label", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByText("Dell · R750 · server · 2U")).toBeTruthy();
  });

  it("data-testid propagates to the wrapper and trigger", () => {
    const { container } = render(
      <SearchableSelect
        options={OPTIONS}
        value=""
        onChange={vi.fn()}
        data-testid="my-select"
      />,
    );
    expect(container.querySelector("[data-testid=my-select]")).not.toBeNull();
    expect(screen.getByTestId("my-select-trigger")).toBeTruthy();
  });
});

// ── Keyboard navigation ────────────────────────────────────────────────────────

describe("SearchableSelect — keyboard navigation", () => {
  it("ArrowDown on closed trigger opens the dropdown", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("button"), { key: "ArrowDown" });
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("ArrowDown when open moves active option down", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // Move down once from initial position
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const activeOptions = document.querySelectorAll("[data-active='true']");
    expect(activeOptions.length).toBe(1);
  });

  it("ArrowDown moves active option index forward through the list", () => {
    // OPTIONS has 4 items; with value="" the first item is active on open.
    // ArrowDown twice → third item (index 2) should be active.
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("Beta Switch");
  });

  it("ArrowUp moves active option up", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // Go to end then back up
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "ArrowUp" });
    const active = document.querySelector("[data-active='true']");
    // Last is index 3 (Gamma Storage), one up is index 2 (Beta Switch)
    expect(active?.textContent).toContain("Beta Switch");
  });

  it("ArrowDown does not go past the last option (no wrap)", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // Press ArrowDown more times than there are options
    for (let i = 0; i < OPTIONS.length + 5; i++) {
      fireEvent.keyDown(input, { key: "ArrowDown" });
    }
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("Gamma Storage");
  });

  it("ArrowUp does not go before the first option (no wrap)", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // First option is already active; pressing ArrowUp repeatedly stays at index 0
    for (let i = 0; i < 5; i++) {
      fireEvent.keyDown(input, { key: "ArrowUp" });
    }
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("— none —");
  });

  it("Home activates the first option", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // Go to end first, then Home
    fireEvent.keyDown(input, { key: "End" });
    fireEvent.keyDown(input, { key: "Home" });
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("— none —");
  });

  it("End activates the last option", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.keyDown(input, { key: "End" });
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("Gamma Storage");
  });

  it("Enter selects the active option and calls onChange", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    // ArrowDown twice: index 0 → 1 (Alpha Server), then 1 → 2 (Beta Switch)
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("Enter closes the dropdown after selection", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("Enter with no results does not call onChange", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "zzz-no-match" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText("Search…"), { key: "Enter" });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("active option resets to first result after typing in search", async () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    // Navigate to last option
    fireEvent.keyDown(screen.getByPlaceholderText("Search…"), { key: "End" });
    // Now type to filter — active should reset to first visible result
    fireEvent.change(screen.getByPlaceholderText("Search…"), {
      target: { value: "alpha" },
    });
    await waitFor(() => {
      const active = document.querySelector("[data-active='true']");
      expect(active?.textContent).toContain("Alpha Server");
    });
  });

  it("active option has data-active='true' attribute", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const active = document.querySelector("[data-active='true']");
    expect(active).not.toBeNull();
    expect(active?.getAttribute("role")).toBe("option");
  });

  it("Escape closes the dropdown without calling onChange", () => {
    const onChange = vi.fn();
    render(<SearchableSelect options={OPTIONS} value="" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("Escape does not propagate to the parent (stopPropagation)", () => {
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button"));
    // Fire keydown in capture phase, as the component registers its listener there
    fireEvent.keyDown(document, { key: "Escape" });
    // The parent div's synthetic keydown handler should not fire
    expect(parentKeyDown).not.toHaveBeenCalled();
  });

  it("opens with currently selected option active", () => {
    render(<SearchableSelect options={OPTIONS} value="b" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const active = document.querySelector("[data-active='true']");
    expect(active?.textContent).toContain("Beta Switch");
  });
});

// ── ARIA attributes ────────────────────────────────────────────────────────────

describe("SearchableSelect — ARIA", () => {
  it("trigger has aria-haspopup='listbox'", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-haspopup")).toBe("listbox");
  });

  it("trigger has aria-expanded=false when closed", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
  });

  it("trigger has aria-expanded=true when open", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  it("listbox has role='listbox'", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByRole("listbox")).toBeTruthy();
  });

  it("options have role='option'", () => {
    render(<SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button"));
    const opts = screen.getAllByRole("option");
    expect(opts.length).toBe(OPTIONS.length);
  });

  it("search input has aria-controls pointing to the listbox id", () => {
    render(
      <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} data-testid="ss" />,
    );
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    const listbox = screen.getByRole("listbox");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("search input aria-activedescendant points to active option id", () => {
    render(
      <SearchableSelect options={OPTIONS} value="" onChange={vi.fn()} data-testid="ss" />,
    );
    fireEvent.click(screen.getByRole("button"));
    const input = screen.getByPlaceholderText("Search…");
    const activeOptId = input.getAttribute("aria-activedescendant");
    expect(activeOptId).toBeTruthy();
    const activeEl = document.getElementById(activeOptId!);
    expect(activeEl).not.toBeNull();
    expect(activeEl?.getAttribute("role")).toBe("option");
  });
});
