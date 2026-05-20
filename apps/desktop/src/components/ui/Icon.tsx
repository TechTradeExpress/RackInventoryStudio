import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  strokeWidth?: number;
  style?: CSSProperties;
  className?: string;
}

function Icon({
  d,
  size = 14,
  strokeWidth = 1.5,
  fill = "none",
  style,
  className,
}: IconProps & { d: React.ReactNode; fill?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      {d}
    </svg>
  );
}

export const IcSearch = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5"/></>} />
);
export const IcFolder = (p: IconProps) => (
  <Icon {...p} d={<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>} />
);
export const IcFolderPlus = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 11v6M9 14h6"/></>} />
);
export const IcGitBranch = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 8v8M18 10v2a4 4 0 0 1-4 4H8"/></>} />
);
export const IcCheck = (p: IconProps) => (
  <Icon {...p} d={<path d="m5 12 5 5 9-11"/>} />
);
export const IcX = (p: IconProps) => (
  <Icon {...p} d={<path d="M6 6l12 12M18 6 6 18"/>} />
);
export const IcPlus = (p: IconProps) => (
  <Icon {...p} d={<path d="M12 5v14M5 12h14"/>} />
);
export const IcChevronRight = (p: IconProps) => (
  <Icon {...p} d={<path d="m9 6 6 6-6 6"/>} />
);
export const IcArrowLeft = (p: IconProps) => (
  <Icon {...p} d={<path d="m12 19-7-7 7-7M5 12h14"/>} />
);
export const IcServer = (p: IconProps) => (
  <Icon {...p} d={<><rect x="3" y="4" width="18" height="7" rx="1.5"/><rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 7.5h.01M7 16.5h.01"/></>} />
);
export const IcNetwork = (p: IconProps) => (
  <Icon {...p} d={<><rect x="3" y="9" width="18" height="6" rx="1.5"/><path d="M7 12h.01M11 12h.01M15 12h.01"/></>} />
);
export const IcStorage = (p: IconProps) => (
  <Icon {...p} d={<><ellipse cx="12" cy="6" rx="8" ry="2.5"/><path d="M4 6v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5V6"/><path d="M4 12v6c0 1.4 3.6 2.5 8 2.5s8-1.1 8-2.5v-6"/></>} />
);
export const IcUps = (p: IconProps) => (
  <Icon {...p} d={<><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="m11 8-3 5h4l-1 4 4-6h-4z"/></>} />
);
export const IcBox = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 7v10l9 4 9-4V7l-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></>} />
);
export const IcLayers = (p: IconProps) => (
  <Icon {...p} d={<><path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5M3 18l9 5 9-5"/></>} />
);
export const IcMapPin = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 22s8-7 8-13a8 8 0 1 0-16 0c0 6 8 13 8 13z"/><circle cx="12" cy="9" r="2.5"/></>} />
);
export const IcUpload = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 21h14"/></>} />
);
export const IcDownload = (p: IconProps) => (
  <Icon {...p} d={<><path d="M12 3v12M7 12l5 5 5-5"/><path d="M5 21h14"/></>} />
);
export const IcCheckCircle = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></>} />
);
export const IcAlertTriangle = (p: IconProps) => (
  <Icon {...p} d={<><path d="M10.3 3.7 2.5 17.3a2 2 0 0 0 1.7 3h15.6a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></>} />
);
export const IcAlertCircle = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></>} />
);
export const IcInfo = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></>} />
);
export const IcEdit = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 21h4l11-11-4-4L3 17z"/><path d="m14 6 4 4"/></>} />
);
export const IcTrash = (p: IconProps) => (
  <Icon {...p} d={<><path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/></>} />
);
export const IcDrag = (p: IconProps) => (
  <Icon {...p} strokeWidth={0} fill="currentColor" d={<><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></>} />
);
export const IcRefresh = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 12a9 9 0 0 1 15.7-6L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.7 6L3 16"/><path d="M3 21v-5h5"/></>} />
);
export const IcSave = (p: IconProps) => (
  <Icon {...p} d={<><path d="M5 3h11l4 4v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M7 3v6h9V3M7 21v-7h10v7"/></>} />
);
export const IcFilter = (p: IconProps) => (
  <Icon {...p} d={<path d="M3 4h18l-7 9v6l-4 2v-8z"/>} />
);
export const IcPush = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="6" cy="6" r="2"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 8v8M8 6h6a4 4 0 0 1 4 4v.5"/><path d="m15 9 3 3-3 3"/></>} />
);
export const IcClock = (p: IconProps) => (
  <Icon {...p} d={<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>} />
);
export const IcListChecks = (p: IconProps) => (
  <Icon {...p} d={<><path d="M3 5h2M3 12h2M3 19h2M9 5h12M9 12h12M9 19h12"/></>} />
);
export const IcCornerArrow = (p: IconProps) => (
  <Icon {...p} d={<path d="M15 4v6a2 2 0 0 1-2 2H5l4-4M5 12l4 4"/>} />
);
export const IcFile = (p: IconProps) => (
  <Icon {...p} d={<><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></>} />
);
export const IcEye = (p: IconProps) => (
  <Icon {...p} d={<><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>} />
);
