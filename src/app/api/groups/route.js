import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase/service';
import { toGroupDto } from '../../../lib/groups';
import { PROGRAM_GROUPS, ROOM_CAPACITY } from '../../../lib/programs';

function withAvailability(groups, counts) {
  return groups.map((grp) => {
    const capacity = grp.roomCapacity || ROOM_CAPACITY;
    const count = counts[grp.id] || 0;
    const occupancy = count % capacity;
    const cohortNumber = Math.floor(count / capacity) + 1;
    return {
      ...grp,
      totalEnrolled: count,
      activeCohortCode: `${grp.id.toUpperCase()}-ROOM-${String(cohortNumber).padStart(2, '0')}`,
      activeCohortOccupancy: occupancy,
      availableSeats: capacity - occupancy,
      maxRoomCapacity: capacity,
      nextSessionDate: 'Upcoming Weekend',
    };
  });
}

// Groups open for registration, with seat availability — aggregate counts only, no personal data.
export async function GET() {
  try {
    const supabase = createServiceClient();
    const [groupsResult, countsResult] = await Promise.all([
      supabase.from('groups').select('*').eq('status', 'open').order('sort_order').order('created_at'),
      supabase.rpc('group_registration_counts'),
    ]);
    if (groupsResult.error) throw groupsResult.error;
    if (countsResult.error) throw countsResult.error;

    const counts = Object.fromEntries(countsResult.data.map((r) => [r.group_id, Number(r.total)]));
    const groups = withAvailability(groupsResult.data.map(toGroupDto), counts);
    return NextResponse.json({
      success: true,
      groups,
      totalRegistrations: groups.reduce((sum, g) => sum + g.totalEnrolled, 0),
    });
  } catch (error) {
    console.error('[api/groups] Falling back to static group list:', error.message || error);
    return NextResponse.json({ success: true, isFallback: true, groups: withAvailability(PROGRAM_GROUPS, {}) });
  }
}
