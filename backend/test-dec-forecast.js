import { parseISO, eachDayOfInterval, format, addDays } from 'date-fns';
import { getBusinessDayOfWeek } from './config/timezone.js';

// Test forecasting that crosses into December
console.log('Testing forecast that crosses into December:');

// Scenario 1: Nov 15 - Dec 1
const start1 = parseISO('2025-11-15');
const end1 = parseISO('2025-12-01');
const days1 = eachDayOfInterval({ start: start1, end: end1 });
console.log('\nNov 15 - Dec 1:');
console.log('Days:', days1.length);
console.log('Dates:', days1.map(d => format(d, 'yyyy-MM-dd')).join(', '));
console.log('Has Dec 1?', days1.some(d => format(d, 'yyyy-MM-dd') === '2025-12-01'));

// Scenario 2: Nov 30 - Dec 15
const start2 = parseISO('2025-11-30');
const end2 = parseISO('2025-12-15');
const days2 = eachDayOfInterval({ start: start2, end: end2 });
console.log('\nNov 30 - Dec 15:');
console.log('Days:', days2.length);
console.log('First date:', format(days2[0], 'yyyy-MM-dd'));
console.log('Last date:', format(days2[days2.length - 1], 'yyyy-MM-dd'));

// Check day of week calculation for Dec 1
console.log('\nDay of week for Dec 1:');
const dec1 = parseISO('2025-12-01');
const dayOfWeek = getBusinessDayOfWeek(dec1);
console.log('Dec 1 dayOfWeek:', dayOfWeek, `(${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayOfWeek]})`);

// Test what happens with week calculation for Dec 1
const weekStartDec1 = addDays(dec1, -dec1.getDay());
console.log('Dec 1 week starts:', format(weekStartDec1, 'yyyy-MM-dd'));

// Scenario 3: What if endDate parsing is off?
console.log('\n\nTesting endDate parsing issue:');
const endDateStr = '2025-11-30';
const parsedEnd = parseISO(endDateStr);
console.log('End date string:', endDateStr);
console.log('Parsed as UTC:', parsedEnd.toISOString());
console.log('Local time:', parsedEnd.toString());

// Check if parseISO creates dates at midnight UTC which might shift
const testStart = parseISO('2025-11-15');
const testEnd = parseISO('2025-11-30');
console.log('\nStart:', testStart.toISOString());
console.log('End:', testEnd.toISOString());
console.log('End time:', testEnd.getTime());
console.log('End + 1 day:', new Date(testEnd.getTime() + 24*60*60*1000).toISOString());

