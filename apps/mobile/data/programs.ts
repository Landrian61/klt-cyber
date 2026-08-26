import { ImageSourcePropType } from 'react-native';

// Bundled program content for the Radio tab's "Program schedule" list
// (apps/mobile/app/(tabs)/radio.tsx), which needs a `locationType`/`onlineUrl`
// distinction that convex/weeklyPrograms.ts doesn't model — that screen isn't
// wired to Convex yet. Every other program/event surface (Home, /programs,
// /events, and their detail screens) reads real data from Convex directly;
// see convex/weeklyPrograms.ts, convex/events.ts, convex/calendar.ts.

export interface Program {
  id: string;
  name: string;
  shortName: string;
  day: string;
  time: string;
  endTime?: string;
  duration?: string;
  location: string;
  locationType: 'in-person' | 'online' | 'hybrid';
  onlineUrl?: string;
  description: string;
  image: ImageSourcePropType;
}

export const PROGRAMS: Program[] = [
  {
    id: 'morning-glory',
    name: 'Morning Glory',
    shortName: 'Morning Glory',
    day: 'Monday – Friday',
    time: '6:00 AM',
    location: 'Online',
    locationType: 'online',
    onlineUrl: 'reignradio.caster.fm',
    description:
      'Start your day in the presence of God with Apostle Tonny Sekyanzi. Morning Glory is a daily broadcast of prayer, worship, and the Word to set the tone for your day.',
    image: require('@/assets/images/Morning-Glory.jpg'),
  },
  {
    id: 'super-tuesday',
    name: 'Super Tuesday',
    shortName: 'Super Tuesday',
    day: 'Tuesday',
    time: '',
    location: 'Online',
    locationType: 'online',
    onlineUrl: 'reignradio.caster.fm',
    description:
      'Join us live on Super Tuesday! Tune in to reignradio.caster.fm for an uplifting broadcast of teaching, prayer, and worship to carry you through the week.',
    image: require('@/assets/images/Super-T.jpg'),
  },
  {
    id: 'mid-week-service',
    name: 'Mid-Week Service',
    shortName: 'Mid-Week',
    day: 'Wednesday',
    time: '5:00 PM',
    endTime: '7:00 PM',
    location: 'KLT Main Auditorium',
    locationType: 'hybrid',
    onlineUrl: 'reignradio.caster.fm',
    description:
      'Recharge your week with the Mid-Week Service. Join us in person at the auditorium or tune in online for a powerful time of the Word and worship.',
    image: require('@/assets/images/Mid-Week-Service.jpg'),
  },
  {
    id: 'eagles-youth-cell',
    name: 'Eagles Youth Cell',
    shortName: 'Youth Cell',
    day: 'Thursday',
    time: '5:00 PM',
    location: 'KLT Main Auditorium',
    locationType: 'in-person',
    description:
      'Open Counsel — a safe space for the youth to gather, share, and grow together in faith. Join the Eagles Youth Cell every Thursday for worship, discussion, and fellowship.',
    image: require('@/assets/images/Eagles-Youth-Cell.jpg'),
  },
  {
    id: 'tongues-of-fire',
    name: 'Tongues of Fire',
    shortName: 'Tongues of Fire',
    day: 'Friday',
    time: '11:00 PM',
    duration: '3hrs',
    location: 'KLT Main Auditorium',
    locationType: 'in-person',
    description:
      '3 hours of unbroken tongues of fire — an intense session of praying in the Spirit every Friday night. Come expecting a fresh encounter with the Holy Ghost as we press into the Year of Kingdom Leadership and Governance.',
    image: require('@/assets/images/Tongues-of-fire.jpg'),
  },
  {
    id: 'womens-fellowship',
    name: "Women's Fellowship",
    shortName: "Women's",
    day: 'Monday',
    time: '5:00 PM',
    endTime: '7:00 PM',
    location: 'KLT Main Auditorium',
    locationType: 'in-person',
    description:
      'A weekly gathering for the women of the Kingdom. Come together for fellowship, prayer, and encouragement as we grow in faith and purpose.',
    image: require('@/assets/images/Womens-Fellowship.jpg'),
  },
  {
    id: 'mens-fortnight-service',
    name: "Men's Fortnight Service",
    shortName: "Men's Service",
    day: 'Monday (Fortnightly)',
    time: '7:00 PM',
    endTime: '12:00 AM',
    location: 'KLT Main Auditorium',
    locationType: 'in-person',
    description:
      "A fortnightly gathering dedicated to the men of the Kingdom. An evening of intense prayer, teaching, and brotherhood as we pursue God's purpose for men in leadership and governance.",
    image: require('@/assets/images/Men\'s Service.jpg'),
  },
  {
    id: 'bride-and-groom',
    name: "Kingdom Brides & Grooms' Fellowship",
    shortName: 'Brides & Grooms',
    day: 'Every 2nd Friday',
    time: '6:00 PM',
    endTime: '8:00 PM',
    location: 'KLT Main Auditorium',
    locationType: 'in-person',
    description:
      'A fellowship dedicated to couples preparing for and living in covenant marriage. Join every second Friday for teaching, sharing, and prayer as we build Kingdom families.',
    image: require('@/assets/images/Bride-and-Groom.jpg'),
  },
  {
    id: 'eagles-experience',
    name: 'The Eagles Experience',
    shortName: 'Eagles Experience',
    day: 'Every Last Sunday',
    time: '11:00 AM',
    endTime: '1:00 PM',
    location: 'Youth Church Level 3',
    locationType: 'in-person',
    description:
      'A monthly KLT program for the youth — every last Sunday. Worship, word, and fellowship designed for the Eagles generation. Meet at Youth Church Level 3.',
    image: require('@/assets/images/Eagles-Experience.jpg'),
  },
  {
    id: 'holy-ghost-night',
    name: 'Monthly Holy Ghost Night',
    shortName: 'Holy Ghost Night',
    day: 'Every 3rd Friday',
    time: '8:00 PM',
    endTime: '5:00 AM',
    location: 'KLT Main Auditorium',
    locationType: 'hybrid',
    onlineUrl: 'reignradio.caster.fm',
    description:
      'A monthly night of intense encounter with the Holy Spirit. From 8 PM through to 5 AM, expect deep worship, prophetic ministry, and corporate prayer. Join in person or online.',
    image: require('@/assets/images/Holy-Ghost-Night.jpg'),
  },
  {
    id: 'new-month-crossover',
    name: 'New Month Crossover',
    shortName: 'Crossover',
    day: 'Last day of every month',
    time: '11:00 PM',
    location: 'Online',
    locationType: 'online',
    onlineUrl: 'reignradio.caster.fm',
    description:
      'Join our Father in the Lord for a powerful crossover into the new month. A night of prophetic declarations, prayer, and worship as we step into new beginnings.',
    image: require('@/assets/images/Crossover.jpg'),
  },
];

export function getOnlinePrograms(): Program[] {
  return PROGRAMS.filter((p) => p.locationType === 'online' || p.locationType === 'hybrid');
}
