// English pack — the KEY SCHEMA. th.mjs must satisfy every key (enforced by
// test/i18n.test.mjs). A third language (e.g. Burmese) is an additive file,
// never a refactor (§2.3). Operator packs override any key at runtime.
export const en = {
  // chrome
  'app.tagline': 'Household help in {city}',
  'nav.directory': 'Find help',
  'nav.jobs': 'Jobs',
  'nav.me': 'Me',
  'nav.admin': 'Admin',
  'action.next': 'Next',
  'action.back': 'Back',
  'action.save': 'Save',
  'action.cancel': 'Cancel',
  'action.search': 'Search',
  'action.clear': 'Clear',
  'action.viewProfile': 'View profile',
  'common.optional': 'optional',
  'common.perHour': '/hr',
  'common.perVisit': '/visit',
  'common.perDay': '/day',
  'common.perMonth': '/mo',
  'common.baht': '฿',
  'common.negotiable': 'negotiable',
  'common.yearsExp': '{n} yrs experience',
  'common.liveIn': 'Live-in possible',

  // directory
  'dir.title': 'Household workers in {city}',
  'dir.count': '{n} workers',
  'dir.count.one': '1 worker',
  'dir.filter.category': 'Service',
  'dir.filter.zone': 'Area',
  'dir.filter.language': 'Language',
  'dir.filter.tier': 'Verification',
  'dir.filter.engagement': 'Engagement',
  'dir.filter.any': 'Any',
  'dir.sort': 'Sort',
  'dir.sort.recent': 'Newest',
  'dir.sort.reply': 'Replies fastest',
  'dir.empty': 'No workers match these filters yet.',
  'dir.emptyHint': 'Try widening the area or service. New profiles are added weekly.',
  'dir.assisted': 'Listed by our team — awaiting the worker to claim it',

  // engagement types
  'engagement.task': 'One-off task',
  'engagement.short': 'Short contract',
  'engagement.long': 'Long contract',

  // reply buckets (computed, honest — §7.2)
  'reply.within_hour': 'Usually replies within an hour',
  'reply.within_day': 'Usually replies within a day',
  'reply.few_days': 'Usually replies within a few days',
  'reply.slow': 'Replies occasionally',
  'reply.none': 'No reply history yet',

  // verification tiers (shape + label, never colour-only — §6)
  'tier.T0': 'Phone verified',
  'tier.T0.glyph': '○',
  'tier.T1': 'ID verified',
  'tier.T1.glyph': '◐',
  'tier.T2': 'ID + references',
  'tier.T2.glyph': '●',
  'tier.T3': 'Background checked',
  'tier.T3.glyph': '★',
  'tier.explain': 'How verification works',

  // profile
  'profile.about': 'About',
  'profile.services': 'Services',
  'profile.areas': 'Works in',
  'profile.languages': 'Languages',
  'profile.rates': 'Rates',
  'profile.engagement': 'Accepts',
  'profile.experience': 'Experience',
  'profile.license': 'Licence no.',
  'profile.certificate': 'Certificate',
  'profile.contactHidden': 'Contact details are shared once an offer is accepted.',
  'profile.message': 'Contact {name}',

  // languages
  'lang.th': 'Thai',
  'lang.en': 'English',
  'lang.my': 'Burmese',
  'lang.shan': 'Shan',
  'lang.km': 'Khmer',
  'lang.lo': 'Lao',

  // service categories (taxonomy is data; these are the labels)
  'cat.housekeeper': 'Housekeeper / cleaner',
  'cat.handyperson': 'Handyperson',
  'cat.gardener': 'Gardener / groundskeeper',
  'cat.cook': 'Cook',
  'cat.driver': 'Driver',
  'cat.massage': 'Massage (home visit)',
  'cat.nanny': 'Nanny / childcare',
  'cat.caregiver': 'Elder caregiver',
  'cat.companion': 'Companion / errands',
  'cat.petcare': 'Pet care',
  'cat.laundry': 'Laundry & ironing',
  'cat.pool': 'Pool maintenance',
  'cat.aircon': 'AC cleaning',
  'cat.pest': 'Pest control',
  'cat.security': 'Night watch / security',
  'cat.tutor': 'Tutor',
  'cat.nurse': 'Licensed nurse',

  // zones
  'zone.old-city': 'Old City',
  'zone.nimman': 'Nimman',
  'zone.santitham': 'Santitham',
  'zone.chang-khlan': 'Chang Khlan',
  'zone.hang-dong': 'Hang Dong',
  'zone.san-sai': 'San Sai',
  'zone.mae-rim': 'Mae Rim',
  'zone.san-kamphaeng': 'San Kamphaeng',
  'zone.saraphi': 'Saraphi',
  'zone.doi-saket': 'Doi Saket',

  // static pages
  'page.how.title': 'How HomeMatch works',
  'page.how.body': 'Browse real worker profiles, contact anyone directly, and agree the work between yourselves. HomeMatch is a place to find each other — not an agency, not an employer, and never a cut of your wages after the first match.',
  'page.about.title': 'About',
  'page.privacy.title': 'Privacy',
  'legal.notEmployer': 'HomeMatch is a matching venue, not a party to any contract and not an employer.',
}

/** @type {Record<string,string>} */
export const KEYS = en
