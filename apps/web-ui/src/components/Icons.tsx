import type { JSX } from 'react';

/**
 * Minimal inline SVG icon set (stroke-based, Lucide-inspired) so the UI has
 * crisp icons with zero extra dependencies. Names match the ui-ux-pro-max
 * icon vocabulary (menu, home, plus, x, search, settings…).
 */

interface IconProps {
  size?: number;
  className?: string;
}

function base(size: number): Record<string, string | number> {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  };
}

export function IconCombat({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M3 11h4l2-6 3 14 2.5-8H21" />
    </svg>
  );
}

export function IconWipe({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 9v4m0 4h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </svg>
  );
}

export function IconReport({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
      <path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" />
    </svg>
  );
}

export function IconChat({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
      <path d="M8 9h8M8 13h5" />
    </svg>
  );
}

export function IconPlus({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClose({ size = 16, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconSettings({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </svg>
  );
}

export function IconSend({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </svg>
  );
}

export function IconSpark({ size = 18, className }: IconProps): JSX.Element {
  return (
    <svg {...base(size)} className={className} aria-hidden="true">
      <path d="M12 3v3m0 12v3M5.6 5.6l2.1 2.1m8.6 8.6 2.1 2.1M3 12h3m12 0h3M5.6 18.4l2.1-2.1m8.6-8.6 2.1-2.1" />
    </svg>
  );
}

/** Map module id → icon component. */
export function moduleIcon(id: string): (props: IconProps) => JSX.Element {
  switch (id) {
    case 'combat':
      return IconCombat;
    case 'wipe':
      return IconWipe;
    case 'report':
      return IconReport;
    default:
      return IconChat;
  }
}