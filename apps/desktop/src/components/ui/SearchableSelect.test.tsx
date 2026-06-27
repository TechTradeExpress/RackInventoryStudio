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
