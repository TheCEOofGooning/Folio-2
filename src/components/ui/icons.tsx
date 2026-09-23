/**
 * Icons — inline SVG, zero dependencies.
 *
 * An icon package is 60–200 KB of JavaScript for shapes that are one line of
 * SVG each. These are hand-tuned on a 24×24 grid with a 1.6 stroke, inherit
 * `currentColor`, and are plain server-renderable components (no client JS).
 *
 * Every icon takes `className`, and decorative ones default to `aria-hidden`.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ children, title, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      width={20}
      height={20}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const SunIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
);

export const MoonIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5Z" />
  </Icon>
);

export const SystemIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M8 20.5h8M12 16.5v4" />
  </Icon>
);

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const PlusIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const ClapIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7.5 11.5 6 10a2 2 0 0 1 0-2.8l3.6-3.5a1.6 1.6 0 0 1 2.3 0l1 1" />
    <path d="M10.5 12.5 8.6 10.6a1.6 1.6 0 0 1 0-2.3l3.3-3.2a1.6 1.6 0 0 1 2.3 0l4 4.1a5.4 5.4 0 0 1 1.6 3.8v1.4a6.3 6.3 0 0 1-6.3 6.3h-1a5.6 5.6 0 0 1-4.3-2l-4-5a1.5 1.5 0 0 1 .2-2.1 1.6 1.6 0 0 1 2.1.1l1.5 1.5" />
  </Icon>
);

export const BookmarkIcon = ({ filled, ...props }: IconProps & { filled?: boolean }) => (
  <Icon {...props} fill={filled ? "currentColor" : "none"}>
    <path d="M6.5 4.5h11a1 1 0 0 1 1 1v14l-6.5-4-6.5 4v-14a1 1 0 0 1 1-1Z" />
  </Icon>
);

export const CommentIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M20.5 12c0 4.4-3.8 8-8.5 8a9.6 9.6 0 0 1-2.6-.35L4.5 21l1.3-4A7.8 7.8 0 0 1 3.5 12c0-4.4 3.8-8 8.5-8s8.5 3.6 8.5 8Z" />
  </Icon>
);

export const EyeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
);

export const ClockIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const ArrowRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 12h14M13 6.5l5.5 5.5L13 17.5" />
  </Icon>
);

export const ArrowUpRightIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const ChevronLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M14.5 6 8.5 12l6 6" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const CheckIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const SparkleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 3.5 13.6 9 19 10.6 13.6 12.2 12 17.6 10.4 12.2 5 10.6 10.4 9 12 3.5Z" />
    <path d="M18.5 16.5l.7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7.7-2.3Z" />
  </Icon>
);

export const TrendingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 16.5 9 11l3.5 3.5L20.5 6" />
    <path d="M15.5 6h5v5" />
  </Icon>
);

export const TagIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 11.5V5.5a1.5 1.5 0 0 1 1.5-1.5h6l8.5 8.5a1.4 1.4 0 0 1 0 2l-5.5 5.5a1.4 1.4 0 0 1-2 0Z" />
    <circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none" />
  </Icon>
);

export const UserIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.8 20a7.4 7.4 0 0 1 14.4 0" />
  </Icon>
);

export const UsersIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="9.5" cy="8.5" r="3.4" />
    <path d="M3 19.5a6.6 6.6 0 0 1 13 0M16.5 5.6a3.4 3.4 0 0 1 0 6.6M18 19.5a6.5 6.5 0 0 0-2-4.7" />
  </Icon>
);

export const SettingsIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="2.8" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.9 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.9l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.7a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 2.9-1.2V2.7a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9h.2a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);

export const LogoutIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h7.5A1.5 1.5 0 0 0 15 18v-2.5" />
    <path d="M9.5 12h11M17.5 8.5 21 12l-3.5 3.5" />
  </Icon>
);

export const PenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20.5h4l10-10a2.5 2.5 0 0 0-3.5-3.5l-10 10Z" />
    <path d="m14.5 7 3 3" />
  </Icon>
);

export const TrashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.5 19a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12.5" />
  </Icon>
);

export const ChartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16.5v-4M12 16.5V8M16 16.5v-6M20 16.5V6" />
  </Icon>
);

export const BookOpenIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 6.5v13" />
    <path d="M12 6.5C10.5 5 8.4 4.5 4.5 4.5v13c3.9 0 6 .5 7.5 2 1.5-1.5 3.6-2 7.5-2v-13c-3.9 0-6 .5-7.5 2Z" />
  </Icon>
);

export const TextSizeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3.5 18 8 6l4.5 12M5 14.5h6" />
    <path d="M15 18l3-8 3 8M16.2 15.4h3.6" />
  </Icon>
);

export const ColumnsIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.8" />
    <path d="M9.5 4.5v15M14.5 4.5v15" />
  </Icon>
);

export const BoldIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7Zm0 7h7a4 4 0 0 1 0 8H7Z" />
  </Icon>
);

export const ItalicIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M15 5H9.5M14.5 19H9M13.5 5 10.5 19" />
  </Icon>
);

export const QuoteIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6.5C6.5 7.8 5 10.2 5 13.2c0 2.6 1.4 4.3 3.4 4.3 1.8 0 3-1.3 3-3 0-1.7-1.1-2.9-2.7-2.9-.3 0-.6 0-.8.1.3-1.5 1.4-2.9 3-3.7Z" />
    <path d="M19 6.5c-2.5 1.3-4 3.7-4 6.7 0 2.6 1.4 4.3 3.4 4.3 1.8 0 3-1.3 3-3 0-1.7-1.1-2.9-2.7-2.9-.3 0-.6 0-.8.1.3-1.5 1.4-2.9 3-3.7Z" />
  </Icon>
);

export const CodeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m8.5 8-4.5 4 4.5 4M15.5 8l4.5 4-4.5 4" />
  </Icon>
);

export const ListIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M9 6.5h11M9 12h11M9 17.5h11M4.5 6.5h.01M4.5 12h.01M4.5 17.5h.01" />
  </Icon>
);

export const LinkIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M10 13.5a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7L11.5 6.3" />
    <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 1 0 5.7 5.7l1.1-1.1" />
  </Icon>
);

export const ImageIcon = (props: IconProps) => (
  <Icon {...props}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="m4.5 17.5 4.7-4.4a1.6 1.6 0 0 1 2.2 0l4.3 4.1M14.5 14.2l1.6-1.5a1.6 1.6 0 0 1 2.2 0l2 1.9" />
  </Icon>
);

export const HeadingIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 5v14M18 5v14M6 12h12" />
  </Icon>
);

export const ShareIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="17.5" cy="6" r="2.8" />
    <circle cx="6.5" cy="12" r="2.8" />
    <circle cx="17.5" cy="18" r="2.8" />
    <path d="m9 10.6 6-3.2M9 13.4l6 3.2" />
  </Icon>
);

export const AlertIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.8v4.6M12 16h.01" />
  </Icon>
);

export const InfoIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 16.2V11M12 8h.01" />
  </Icon>
);

export const LoaderIcon = (props: IconProps) => (
  <Icon {...props} className={`animate-spin ${props.className ?? ""}`}>
    <path d="M12 3.5v3M12 17.5v3M5.5 12h-3M21.5 12h-3M7 7l-2-2M19 19l-2-2M7 17l-2 2M19 5l-2 2" />
  </Icon>
);

export const GlobeIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5s-1.1 6.1-3.3 8.5c-2.2-2.4-3.3-5.4-3.3-8.5s1.1-6.1 3.3-8.5Z" />
  </Icon>
);
