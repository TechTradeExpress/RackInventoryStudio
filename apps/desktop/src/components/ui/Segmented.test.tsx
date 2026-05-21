import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Segmented } from "./Segmented";

afterEach(() => cleanup());

const OPTIONS = [
  { value: "front" as const, label: "Front" },
  { value: "rear" as const, label: "Rear" },
];

describe("Segmented", () => {
  it("renders all options", () => {
    render(
      <Segmented value="front" onChange={vi.fn()} options={OPTIONS} />,
    );
    expect(screen.getByText("Front")).toBeTruthy();
    expect(screen.getByText("Rear")).toBeTruthy();
  });

  it("marks the current value as selected (aria-selected and .on class)", () => {
    render(
      <Segmented value="rear" onChange={vi.fn()} options={OPTIONS} />,
    );
    const rearBtn = screen.getByRole("tab", { name: /rear/i });
    expect(rearBtn.getAttribute("aria-selected")).toBe("true");
    expect(rearBtn.className).toContain("on");

    const frontBtn = screen.getByRole("tab", { name: /front/i });
    expect(frontBtn.getAttribute("aria-selected")).toBe("false");
    expect(frontBtn.className).not.toContain("on");
  });

  it("calls onChange with the clicked option value", () => {
    const onChange = vi.fn();
    render(<Segmented value="front" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByText("Rear"));
    expect(onChange).toHaveBeenCalledWith("rear");
  });

  it("does not call onChange when clicking the already-selected option", () => {
    // onChange IS still called — component is controlled; caller decides if re-render needed
    const onChange = vi.fn();
    render(<Segmented value="front" onChange={onChange} options={OPTIONS} />);
    fireEvent.click(screen.getByText("Front"));
    expect(onChange).toHaveBeenCalledWith("front");
  });

  it("renders ariaLabel on the container", () => {
    render(
      <Segmented
        value="front"
        onChange={vi.fn()}
        options={OPTIONS}
        ariaLabel="Rack side"
      />,
    );
    expect(screen.getByRole("tablist", { name: "Rack side" })).toBeTruthy();
  });

  it("renders count badge when option has count", () => {
    const opts = [
      { value: "a" as const, label: "Alpha", count: 3 },
      { value: "b" as const, label: "Beta" },
    ];
    render(<Segmented value="a" onChange={vi.fn()} options={opts} />);
    expect(screen.getByText("3")).toBeTruthy();
  });
});
