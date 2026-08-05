import { Section, Container } from '@/components/ui/Section';
import { SkeletonBlock, SkeletonCard, LoadingStatus } from '@/components/ui/Skeleton';

export default function ProfLoading() {
  return (
    <Section className="pb-10 md:pb-14">
      <Container>
        <LoadingStatus />
        <div className="overflow-hidden rounded-2xl border border-ink/15 bg-paper">
          <div className="flex flex-col gap-6 px-5 py-7 md:flex-row md:items-center md:gap-10 md:px-10 md:py-10">
            <SkeletonBlock className="h-28 w-28 shrink-0 rounded-xl md:h-36 md:w-36" />
            <div className="min-w-0 flex-1 space-y-3">
              <SkeletonBlock className="h-10 w-2/3 max-w-sm" />
              <SkeletonBlock className="h-3 w-40" />
              <SkeletonBlock className="h-8 w-32 rounded" />
            </div>
            <SkeletonBlock className="h-24 w-24 shrink-0 rounded-full" />
          </div>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </Container>
    </Section>
  );
}
