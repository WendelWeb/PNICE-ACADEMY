/**
 * Unit tests for lib/learner/access.ts's pure access-resolution helpers
 * (Task: two subscription products). `subscriptionsGrantCourse` and
 * `subscriptionAccessibleSlugs` are the ONE place "which pass covers which
 * course" is decided — extracted as pure functions (mirrors
 * lib/teacher/earnings.ts's `splitEarnings`) so the rule is tested without a
 * DB, exactly like every other DB-adjacent module in this codebase.
 */
import { describe, it, expect } from 'vitest';
import {
  subscriptionsGrantCourse,
  subscriptionAccessibleSlugs,
  type SubscriptionGrant,
} from './access';

describe('subscriptionsGrantCourse', () => {
  it('a platform-kind subscription grants any course, regardless of owner', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'platform', teacherPlanId: null }];
    expect(subscriptionsGrantCourse(subs, 'owner-a', new Map())).toBe(true);
    expect(subscriptionsGrantCourse(subs, null, new Map())).toBe(true);
  });

  it('a teacher-kind subscription grants only its own teacher\'s courses', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-a' }];
    const planOwners = new Map([['plan-a', 'owner-a']]);
    expect(subscriptionsGrantCourse(subs, 'owner-a', planOwners)).toBe(true);
    expect(subscriptionsGrantCourse(subs, 'owner-b', planOwners)).toBe(false);
  });

  it('no active subscriptions grants nothing', () => {
    expect(subscriptionsGrantCourse([], 'owner-a', new Map())).toBe(false);
  });

  it('a teacher-kind subscription grants nothing when the course has no owner', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-a' }];
    const planOwners = new Map([['plan-a', 'owner-a']]);
    expect(subscriptionsGrantCourse(subs, null, planOwners)).toBe(false);
  });

  it('a teacher-kind subscription whose plan no longer resolves an owner grants nothing', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-deleted' }];
    expect(subscriptionsGrantCourse(subs, 'owner-a', new Map())).toBe(false);
  });

  it('multiple teacher passes: grants a course owned by ANY of them', () => {
    const subs: SubscriptionGrant[] = [
      { kind: 'teacher', teacherPlanId: 'plan-a' },
      { kind: 'teacher', teacherPlanId: 'plan-b' },
    ];
    const planOwners = new Map([
      ['plan-a', 'owner-a'],
      ['plan-b', 'owner-b'],
    ]);
    expect(subscriptionsGrantCourse(subs, 'owner-b', planOwners)).toBe(true);
    expect(subscriptionsGrantCourse(subs, 'owner-c', planOwners)).toBe(false);
  });

  it('a single platform sub among teacher subs still grants everything', () => {
    const subs: SubscriptionGrant[] = [
      { kind: 'teacher', teacherPlanId: 'plan-a' },
      { kind: 'platform', teacherPlanId: null },
    ];
    expect(subscriptionsGrantCourse(subs, 'owner-z', new Map())).toBe(true);
  });
});

describe('subscriptionAccessibleSlugs', () => {
  const allSlugs = ['course-a1', 'course-a2', 'course-b1', 'course-c1'];

  it('a platform pass grants every known course slug', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'platform', teacherPlanId: null }];
    const result = subscriptionAccessibleSlugs(subs, allSlugs, new Map(), new Map());
    expect([...result].sort()).toEqual([...allSlugs].sort());
  });

  it("a teacher pass grants only that teacher's own course slugs", () => {
    const subs: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-a' }];
    const planOwners = new Map([['plan-a', 'owner-a']]);
    const ownerSlugs = new Map([
      ['owner-a', ['course-a1', 'course-a2']],
      ['owner-b', ['course-b1']],
    ]);
    const result = subscriptionAccessibleSlugs(subs, allSlugs, ownerSlugs, planOwners);
    expect([...result].sort()).toEqual(['course-a1', 'course-a2']);
  });

  it('no active subscriptions grants nothing', () => {
    const result = subscriptionAccessibleSlugs([], allSlugs, new Map(), new Map());
    expect(result.size).toBe(0);
  });

  it('a teacher pass whose plan/owner no longer resolves grants nothing', () => {
    const subs: SubscriptionGrant[] = [{ kind: 'teacher', teacherPlanId: 'plan-deleted' }];
    const result = subscriptionAccessibleSlugs(subs, allSlugs, new Map(), new Map());
    expect(result.size).toBe(0);
  });

  it('multiple teacher passes union their respective owners\' course slugs', () => {
    const subs: SubscriptionGrant[] = [
      { kind: 'teacher', teacherPlanId: 'plan-a' },
      { kind: 'teacher', teacherPlanId: 'plan-b' },
    ];
    const planOwners = new Map([
      ['plan-a', 'owner-a'],
      ['plan-b', 'owner-b'],
    ]);
    const ownerSlugs = new Map([
      ['owner-a', ['course-a1']],
      ['owner-b', ['course-b1']],
    ]);
    const result = subscriptionAccessibleSlugs(subs, allSlugs, ownerSlugs, planOwners);
    expect([...result].sort()).toEqual(['course-a1', 'course-b1']);
  });
});
