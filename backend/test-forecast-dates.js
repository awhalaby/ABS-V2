import { parseISO, eachDayOfInterval, format } from 'date-fns';

// Test what happens with date parsing
const startDate = '2025-11-15';
const endDate = '2025-11-30';

console.log('Testing date parsing and interval generation:');
console.log('Start date string:', startDate);
console.log('End date string:', endDate);

const forecastStart = parseISO(startDate);
const forecastEnd = parseISO(endDate);

console.log('\nParsed dates:');
console.log('Start:', forecastStart.toISOString());
console.log('End:', forecastEnd.toISOString());
console.log('Start local:', forecastStart.toString());
console.log('End local:', forecastEnd.toString());

const days = eachDayOfInterval({
  start: forecastStart,
  end: forecastEnd,
});

console.log('\nDays generated:', days.length);
console.log('Expected:', 16); // Nov 15-30 inclusive
console.log('First day:', format(days[0], 'yyyy-MM-dd'));
console.log('Last day:', format(days[days.length - 1], 'yyyy-MM-dd'));

if (days.length > 16) {
  console.log('\n⚠️ PROBLEM: More days than expected!');
  console.log('All days:', days.map(d => format(d, 'yyyy-MM-dd')).join(', '));
  
  // Check if Dec 1 is included
  const hasDec1 = days.some(d => format(d, 'yyyy-MM-dd') === '2025-12-01');
  if (hasDec1) {
    console.log('\n❌ Dec 1 is incorrectly included!');
  }
} else {
  console.log('\n✓ Correct number of days');
}

// Test with a date that crosses month boundary
console.log('\n\nTesting month boundary (Oct 30 - Nov 2):');
const start2 = parseISO('2025-10-30');
const end2 = parseISO('2025-11-02');
const days2 = eachDayOfInterval({ start: start2, end: end2 });
console.log('Days:', days2.map(d => format(d, 'yyyy-MM-dd')).join(', '));
console.log('Count:', days2.length, '(expected 4)');

