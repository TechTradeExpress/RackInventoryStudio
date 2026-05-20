/** MIME type used as the dataTransfer key for rack-placement drag operations. */
export const DND_DATA_TYPE = "application/ris-placement";

/** Payload set on the drag source and consumed by the drop target. */
export type DndPayload =
  | {
      kind: "device";
      deviceId: string;
      deviceCode: string;
      /** null means the backend will use the device model's default height. */
      defaultHeightU: number | null;
    }
  | {
      kind: "rack_object";
      deviceModelId: string;
      modelCode: string;
      defaultHeightU: number;
    };
