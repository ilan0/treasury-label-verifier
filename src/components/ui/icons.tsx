import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      viewBox="0 0 24 24"
      width={size}
      {...props}
    >
      {children}
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="m5 12 4.2 4L19 6.7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </Icon>
  );
}
export function ArrowIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function BatchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M8 6h11M8 12h11M8 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </Icon>
  );
}
export function SparkIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 2.8c.8 4.4 3 6.6 7.4 7.4-4.4.8-6.6 3-7.4 7.4-.8-4.4-3-6.6-7.4-7.4 4.4-.8 6.6-3 7.4-7.4ZM19 16c.3 1.8 1.2 2.7 3 3-1.8.3-2.7 1.2-3 3-.3-1.8-1.2-2.7-3-3 1.8-.3 2.7-1.2 3-3Z"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </Icon>
  );
}
export function WarningIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M10.6 4.3 2.7 18a1.5 1.5 0 0 0 1.3 2.2h16a1.5 1.5 0 0 0 1.3-2.2L13.4 4.3a1.6 1.6 0 0 0-2.8 0ZM12 9v4.5m0 3.4h.01"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function ReviewIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M14 4h4a2 2 0 0 1 2 2v14H4V6a2 2 0 0 1 2-2h4m0-1h4v4h-4V3Zm-2 9h8m-8 4h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Icon>
  );
}
export function SearchIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle
        cx="10.5"
        cy="10.5"
        r="6.5"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m15.5 15.5 4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function ChevronIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="m8.5 10 3.5 3.5 3.5-3.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function ExternalIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M14 5h5v5m0-5-8 8M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Icon>
  );
}
export function ClockIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M12 7.5V12l3 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Icon>
  );
}
export function FileIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M6 3h8l4 4v14H6V3Zm8 0v5h4M9 13h6m-6 4h6"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Icon>
  );
}
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </Icon>
  );
}
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </Icon>
  );
}
export function ShieldIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Zm-3 9 2 2 4-4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    </Icon>
  );
}
