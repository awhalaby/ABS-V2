import { parseISO, eachDayOfInterval, format } from 'date-fns';
import { getBusinessDayOfWeek } from './config/timezone.js';

// Simulate the exact forecast generation process
const startDate = '2025-11-15';
const endDate = '2025-11-30';

console.log('Simulating forecast generation:');
console.log('startDate:', startDate);
console.log('endDate:', endDate);

const forecastStart = parseISO(startDate);
const forecastEnd = parseISO(endDate);

console.log('\nParsed dates:');
console.log('forecastStart:', forecastStart.toISOString());
console.log('forecastEnd:', forecastEnd.toISOString());

const forecastDays = eachDayOfInterval({
  start: forecastStart,
  end: forecastEnd,
});

console.log('\nDays generated:', forecastDays.length);
console.log('Expected: 16 (Nov 15-30 inclusive)');

// Simulate what happens in the forEach loop
const dailyForecast = [];
forecastDays.forEach((date) => {
  const dayOfWeek = getBusinessDayOfWeek(date);
  const dateStr = format(date, "yyyy-MM-dd");
  
  dailyForecast.push({
    date: dateStr,
    dayOfWeek: dayOfWeek,
  });
});

console.log('\nFormatted dates:');
dailyForecast.forEach((f, i) => {
  if (i < 3 || i >= dailyForecast.length - 3) {
    console.log(`  ${f.date} (dayOfWeek=${f.dayOfWeek})`);
  } else if (i === 3) {
    console.log('  ...');
  }
});

// Check for Dec 1
const hasDec1 = dailyForecast.some(f => f.date === '2025-12-01');
if (hasDec1) {
  console.log('\n❌ Dec 1 found in dailyForecast!');
  const dec1Record = dailyForecast.find(f => f.date === '2025-12-01');
  console.log('Dec 1 record:', dec1Record);
} else {
  console.log('\n✓ No Dec 1 in dailyForecast');
}

// Check all unique dates
const uniqueDates = [...new Set(dailyForecast.map(f => f.date))].sort();
console.log('\nUnique dates:', uniqueDates.length);
console.log('First date:', uniqueDates[0]);
console.log('Last date:', uniqueDates[uniqueDates.length - 1]);

if (uniqueDates.includes('2025-12-01')) {
  console.log('\n❌ PROBLEM: 2025-12-01 is in the unique dates!');
  console.log('This means Dec 1 data is being generated when it should not be.');
}

