import { parseISO, eachDayOfInterval, format } from 'date-fns';
import { getBusinessDayOfWeek } from './config/timezone.js';

// Test what happens with timezone conversion
const startDate = '2025-11-15';
const endDate = '2025-11-30';

const forecastStart = parseISO(startDate);
const forecastEnd = parseISO(endDate);

const days = eachDayOfInterval({
  start: forecastStart,
  end: forecastEnd,
});

console.log('Testing timezone conversion:');
console.log('Days generated:', days.length);
console.log('\nFirst few days:');
days.slice(0, 3).forEach(d => {
  const dateStr = format(d, 'yyyy-MM-dd');
  const dayOfWeek = getBusinessDayOfWeek(d);
  console.log(`  ${dateStr}: dayOfWeek=${dayOfWeek}`);
});

console.log('\nLast few days:');
days.slice(-3).forEach(d => {
  const dateStr = format(d, 'yyyy-MM-dd');
  const dayOfWeek = getBusinessDayOfWeek(d);
  console.log(`  ${dateStr}: dayOfWeek=${dayOfWeek}`);
});

// Check if any dates get shifted
console.log('\nChecking for date shifts:');
const dateStrings = days.map(d => format(d, 'yyyy-MM-dd'));
const uniqueDates = [...new Set(dateStrings)];
if (dateStrings.length !== uniqueDates.length) {
  console.log('⚠️ Duplicate dates found!');
}

// Check if Dec 1 appears
const hasDec1 = dateStrings.some(d => d === '2025-12-01');
if (hasDec1) {
  console.log('❌ Dec 1 is incorrectly included!');
  console.log('All dates:', dateStrings.join(', '));
} else {
  console.log('✓ No Dec 1 found');
}

// Test with a forecast that should end on Nov 30
console.log('\n\nTesting forecast ending Nov 30:');
const testDays = eachDayOfInterval({
  start: parseISO('2025-11-15'),
  end: parseISO('2025-11-30'),
});

const formatted = testDays.map(d => format(d, 'yyyy-MM-dd'));
console.log('Dates:', formatted.join(', '));
console.log('Last date:', formatted[formatted.length - 1]);
console.log('Has Dec 1?', formatted.includes('2025-12-01'));

