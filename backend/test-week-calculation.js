import { parseISO, addDays, format, eachDayOfInterval } from 'date-fns';

// Test week calculation for Nov 15-30 forecast
const startDate = '2025-11-15';
const endDate = '2025-11-30';

const forecastStart = parseISO(startDate);
const forecastEnd = parseISO(endDate);

const days = eachDayOfInterval({
  start: forecastStart,
  end: forecastEnd,
});

console.log('Testing week calculation:');
console.log('Forecast period: Nov 15-30, 2025');
console.log('Days:', days.length);

// Test week start calculation for each day
const weekStarts = new Set();
days.forEach(date => {
  const weekStart = addDays(date, -date.getDay());
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  weekStarts.add(weekStartStr);
  console.log(`${format(date, 'yyyy-MM-dd')} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][date.getDay()]}) -> week starts ${weekStartStr}`);
});

console.log('\nUnique week starts:', Array.from(weekStarts).sort());

// Check if any week start is outside the forecast range
const weekStartsArray = Array.from(weekStarts).map(s => parseISO(s));
const minWeekStart = new Date(Math.min(...weekStartsArray.map(d => d.getTime())));
const maxWeekStart = new Date(Math.max(...weekStartsArray.map(d => d.getTime())));

console.log('\nWeek start range:', format(minWeekStart, 'yyyy-MM-dd'), 'to', format(maxWeekStart, 'yyyy-MM-dd'));
console.log('Forecast range:', format(forecastStart, 'yyyy-MM-dd'), 'to', format(forecastEnd, 'yyyy-MM-dd'));

if (minWeekStart < forecastStart) {
  console.log('⚠️ Week start extends before forecast start!');
}

if (maxWeekStart > forecastEnd) {
  console.log('⚠️ Week start extends after forecast end!');
}

// Check specifically for Dec 1
const hasDec1 = Array.from(weekStarts).some(s => s.startsWith('2025-12-01'));
if (hasDec1) {
  console.log('\n❌ Dec 1 found in week starts!');
  console.log('This would cause data to appear for dates outside the forecast range.');
}

