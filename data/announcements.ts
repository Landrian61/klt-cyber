export interface Announcement {
  id: string;
  title: string;
  body: string;
  date: string;
  category: 'general' | 'program' | 'event' | 'admin' | 'youth';
  isPinned: boolean;
  linkedProgramId?: string;
  linkedEventId?: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  // Pinned
  {
    id: 'mwat-timetable',
    title: 'Revamped MWAT Timetable',
    body: 'As we kickstart a new week in this Easter Season, the Moment With Apostle Tonny (MWAT) programme has been revamped:\n\n1. Monday 30th March – Friday 3rd April 2026: Women Only\nTime: 9:00 PM to 1:00 AM (Mon–Thu), Fridays till 2:00 AM\nNote: No Women\'s Fellowship this week — all women encouraged to attend MWAT.\n\n2. Monday 6th April – Friday 10th April 2026: Men Only\nTime: 9:00 PM to 1:00 AM (Mon–Thu), Fridays till 2:00 AM\n\n3. Monday 13th April – Friday 17th April 2026: Youth Only\nTime: 9:00 PM to 1:00 AM (Mon–Thu), Fridays till 2:00 AM',
    date: '29 Mar 2026',
    category: 'program',
    isPinned: true,
    linkedEventId: 'mwat-women',
  },

  // Events
  {
    id: 'good-friday',
    title: 'Special Good Friday Service',
    body: 'We will be having a special Good Friday Service on Friday 3rd April 2026 from 3:00 PM to 6:00 PM. All members are encouraged to attend this solemn gathering as we commemorate the sacrifice of our Lord.',
    date: '29 Mar 2026',
    category: 'event',
    isPinned: false,
    linkedEventId: 'good-friday-service',
  },
  {
    id: 'water-baptism',
    title: 'Water Baptism — Saturday 4th April',
    body: 'There will be Water Baptism this Saturday 4th April 2026. All those that haven\'t been baptised please register with Mr. Maroro Ibrahim (0757025154).',
    date: '29 Mar 2026',
    category: 'event',
    isPinned: false,
    linkedEventId: 'water-baptism',
  },
  {
    id: 'easter-sunday',
    title: 'Easter Sunday — Judah Clan Ministering',
    body: 'Judah Clan will be ministering on Easter Sunday 5th April 2026. On this note all members of Judah Clan are called upon to participate.',
    date: '29 Mar 2026',
    category: 'general',
    isPinned: false,
    linkedEventId: 'easter-sunday',
  },
  {
    id: 'liberation-service',
    title: 'First Liberation Service',
    body: 'Our First Liberation Service will take place on Sunday 12th April 2026 and will be power packed. Come expecting a transformative encounter.',
    date: '29 Mar 2026',
    category: 'event',
    isPinned: false,
    linkedEventId: 'liberation-service',
  },
  {
    id: 'hgn-youth-april',
    title: 'Holy Ghost Night — Youth Led (April)',
    body: 'Our Holy Ghost Night for the Month of April will be on Friday 17th April 2026 and will be led by the YOUTH. A powerful night of encounter awaits!',
    date: '29 Mar 2026',
    category: 'youth',
    isPinned: false,
    linkedProgramId: 'holy-ghost-night',
  },
  {
    id: 'first-youth-service',
    title: 'First Youth Service',
    body: 'Our very first Youth Service took place on 29th March 2026 from 11:00 AM to 1:00 PM. Praise God for this milestone!',
    date: '29 Mar 2026',
    category: 'youth',
    isPinned: false,
  },
  {
    id: 'weekly-programs',
    title: 'Weekly Programs Reminder',
    body: 'All our weekly programs are on this week as follows:\n\n• Monday: Women\'s Fellowship 5:00 PM – 7:00 PM\n• Super Tuesday: 24-hour Prayer Chain led by Clans\n• Wednesday: Mid-week Service 5:00 PM – 7:00 PM\n• Thursday: Youth Cell 5:00 PM – 7:00 PM\n• Mon–Fri: Lunch Hour Prayers 12:00 noon – 2:00 PM\n• Every Friday: Tongues of Fire 11:00 PM – 2:00 AM\n• MWAT: Monday to Friday 9:00 PM – 1:00 AM',
    date: '29 Mar 2026',
    category: 'program',
    isPinned: false,
  },
  {
    id: 'album-launch',
    title: 'Pastor Kaggwa Album Launch — "YESU WERAGE"',
    body: 'Pastor Kaggwa will be launching his Album titled "YESU WERAGE" on Sunday 30th August 2026. More details to come your way.',
    date: '29 Mar 2026',
    category: 'general',
    isPinned: false,
    linkedEventId: 'album-launch',
  },
  {
    id: 'investment-club',
    title: 'KLT Investment Club — Q1 Dues',
    body: 'All members of KLT Investment Club that have not yet paid up their dues for Q1 2026 are called upon to do so as soon as possible.',
    date: '29 Mar 2026',
    category: 'admin',
    isPinned: false,
  },
  {
    id: 'socket-caution',
    title: 'ToF Socket Usage Caution',
    body: 'All those using the sockets on the ToF (Tongues of Fire) with other electric gadgets are kindly asked to stop with immediate effect.',
    date: '29 Mar 2026',
    category: 'admin',
    isPinned: false,
  },
  {
    id: 'nira-certificates',
    title: 'NIRA Marriage Certificates — Final Call',
    body: 'Final call to all the couples wedded from KLT that do not have their NIRA Marriage Certificates. You are kindly requested to see the Church Administrator with photocopies of your National IDs, Church Marriage Certificate, and details of both your parents.',
    date: '29 Mar 2026',
    category: 'admin',
    isPinned: false,
  },
];

export function getPinnedAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => a.isPinned);
}

export function getRegularAnnouncements(): Announcement[] {
  return ANNOUNCEMENTS.filter((a) => !a.isPinned);
}

export function getAnnouncementById(id: string): Announcement | undefined {
  return ANNOUNCEMENTS.find((a) => a.id === id);
}
