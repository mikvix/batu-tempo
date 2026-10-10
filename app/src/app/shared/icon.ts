import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type IconName =
  | 'back'
  | 'play'
  | 'pause'
  | 'plus'
  | 'minus'
  | 'sliders'
  | 'volume'
  | 'volume-mute'
  | 'chevron-right'
  | 'chevron-down'
  | 'chevron-up'
  | 'flash'
  | 'refresh'
  | 'skip'
  | 'shuffle'
  | 'pulse'
  | 'target'
  | 'metronome'
  | 'person'
  | 'eye-off'
  | 'megaphone'
  | 'trending'
  | 'hourglass'
  | 'timer'
  | 'swap'
  | 'list'
  | 'disc'
  | 'share'
  | 'edit'
  | 'trash'
  | 'copy'
  | 'mic'
  | 'star'
  | 'flame'
  | 'lock'
  | 'check'
  | 'route'
  | 'headphones'
  | 'close';

/** Icônes en SVG inline (traits), colorées par `currentColor`. */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display:inline-flex; line-height:0' },
  template: `
    <svg
      [attr.width]="size()"
      [attr.height]="size()"
      viewBox="0 0 24 24"
      [attr.fill]="filled() ? 'currentColor' : 'none'"
      [attr.stroke]="filled() ? 'none' : 'currentColor'"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true">
      @switch (name()) {
        @case ('back') {
          <path d="M15 18l-6-6 6-6" />
        }
        @case ('play') {
          <path d="M8 5v14l11-7z" />
        }
        @case ('pause') {
          <rect x="6" y="5" width="4" height="14" rx="1" />
          <rect x="14" y="5" width="4" height="14" rx="1" />
        }
        @case ('plus') {
          <path d="M12 5v14M5 12h14" />
        }
        @case ('minus') {
          <path d="M5 12h14" />
        }
        @case ('sliders') {
          <path d="M4 7h16M4 17h16" />
          <circle cx="14" cy="7" r="2.5" fill="var(--surface)" />
          <circle cx="9" cy="17" r="2.5" fill="var(--surface)" />
        }
        @case ('volume') {
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        }
        @case ('volume-mute') {
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="m22 9-6 6M16 9l6 6" />
        }
        @case ('chevron-right') {
          <path d="m9 6 6 6-6 6" />
        }
        @case ('chevron-down') {
          <path d="m6 9 6 6 6-6" />
        }
        @case ('chevron-up') {
          <path d="m6 15 6-6 6 6" />
        }
        @case ('flash') {
          <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
        }
        @case ('refresh') {
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 3v6h6" />
        }
        @case ('skip') {
          <path d="M5 4l10 8-10 8z" />
          <path d="M19 4v16" />
        }
        @case ('shuffle') {
          <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        }
        @case ('pulse') {
          <path d="M3 12h2l2-6 3 12 3-9 2 5 2-2h4" />
        }
        @case ('target') {
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="5" />
          <circle cx="12" cy="12" r="1.2" fill="currentColor" />
        }
        @case ('metronome') {
          <path d="M9 3h6l3 18H6z" />
          <path d="M12 15l5-9" />
        }
        @case ('person') {
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
        }
        @case ('eye-off') {
          <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
          <path d="M3 3l18 18" />
        }
        @case ('megaphone') {
          <path d="M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1z" />
          <path d="M17 9a4 4 0 0 1 0 6" />
        }
        @case ('trending') {
          <path d="M3 17l5-5 4 4 5-7 4 3" />
        }
        @case ('hourglass') {
          <path d="M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4" />
        }
        @case ('timer') {
          <circle cx="12" cy="13" r="8" />
          <path d="M12 9v4l3 2M9 2h6" />
        }
        @case ('swap') {
          <path d="M7 16V4m0 0L3 8m4-4 4 4M17 8v12m0 0 4-4m-4 4-4-4" />
        }
        @case ('list') {
          <path d="M4 6h16M4 12h10M4 18h7" />
        }
        @case ('disc') {
          <ellipse cx="12" cy="7" rx="8" ry="3" />
          <path d="M4 7v9c0 1.7 3.6 3 8 3s8-1.3 8-3V7" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        }
        @case ('share') {
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
        }
        @case ('edit') {
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
        }
        @case ('trash') {
          <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
        }
        @case ('copy') {
          <rect x="9" y="9" width="12" height="12" rx="2" />
          <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
        }
        @case ('mic') {
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        }
        @case ('star') {
          <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />
        }
        @case ('flame') {
          <path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 2 1.3 3 2.5 3.5C11 9 11 5 12 2z" />
        }
        @case ('lock') {
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        }
        @case ('check') {
          <path d="m5 12 5 5 9-10" />
        }
        @case ('route') {
          <path d="M4 20h4l2-8 4 6 2-4h4" />
          <circle cx="20" cy="6" r="2" />
        }
        @case ('headphones') {
          <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
          <rect x="3" y="14" width="4" height="7" rx="1.5" />
          <rect x="17" y="14" width="4" height="7" rx="1.5" />
        }
        @case ('close') {
          <path d="M6 6l12 12M18 6 6 18" />
        }
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input(22);
  readonly filled = input(false);
}
