import {
  IconInfoCircle,
  IconVideo,
  IconPhoto,
  IconSpeakerphone,
  type Icon as TablerIcon,
} from '@tabler/icons-react';
import type { EditorStepKey } from '@/lib/courses/readiness-anchors';

/**
 * The 4 editor steps' visual identity (Stage 1 — task-first navigation): ONE
 * icon per step, shared by every surface that names a step (`ControlRail`'s
 * desktop list, the mobile `MobileStepBar`, `EditorStepHeading`) so a teacher
 * learns "the camera means the lessons-and-videos step" once and finds it
 * again everywhere. The step KEYS are the frozen `?tab=` contract
 * (`lib/courses/readiness-anchors.ts`) — this module only decorates them,
 * it never adds/renames a step.
 */
export const STEP_ICONS: Record<EditorStepKey, TablerIcon> = {
  infos: IconInfoCircle,
  plan: IconVideo,
  medias: IconPhoto,
  ressources: IconSpeakerphone,
};

/** Same circled numbers the bordereau's rail always used (① → ④). */
export const STEP_GLYPH: Record<number, string> = { 1: '①', 2: '②', 3: '③', 4: '④' };
