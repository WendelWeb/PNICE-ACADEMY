import { Section, Container } from '@/components/ui/Section';
import { SkeletonBlock, LoadingStatus } from '@/components/ui/Skeleton';

export default function CourseDetailLoading() {
  return (
    <Section>
      <Container>
        <LoadingStatus />
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <SkeletonBlock className="h-3 w-28" />
            <SkeletonBlock className="h-10 w-full max-w-lg" />
            <SkeletonBlock className="h-4 w-full max-w-md" />
            <SkeletonBlock className="aspect-video w-full rounded-2xl" />
            <div className="space-y-2.5 pt-2">
              <SkeletonBlock className="h-3.5 w-full" />
              <SkeletonBlock className="h-3.5 w-11/12" />
              <SkeletonBlock className="h-3.5 w-4/5" />
            </div>
          </div>
          <div className="space-y-4 rounded-2xl border border-ink/12 bg-paper-light p-6">
            <SkeletonBlock className="h-8 w-2/3" />
            <SkeletonBlock className="h-11 w-full rounded" />
            <SkeletonBlock className="h-11 w-full rounded" />
            <SkeletonBlock className="h-3 w-1/2" />
          </div>
        </div>
      </Container>
    </Section>
  );
}
