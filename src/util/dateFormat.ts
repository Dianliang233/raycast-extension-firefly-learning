export default function dateFormat(date: Date, absolute = true, relative = true, style: 'long' | 'short' = 'long') {
  const absoluteDate = new Intl.DateTimeFormat('en-US', {
    weekday: style === 'long' ? 'short' : undefined,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date)
  if (!relative) return absoluteDate

  const deltaDays = Math.floor((date.getTime() - Date.now()) / 1000 / 60 / 60 / 24) + 1

  let delta: number = deltaDays
  let unit: Intl.RelativeTimeFormatUnit = 'day'

  if (Math.abs(deltaDays) > 355) {
    delta = Math.round((deltaDays / 365) * 10) / 10
    unit = 'year'
  } else if (Math.abs(deltaDays) > 29) {
    delta = Math.floor(deltaDays / 30)
    unit = 'month'
  } else if (Math.abs(deltaDays) > 6) {
    delta = Math.floor(deltaDays / 7)
    unit = 'week'
  }

  const relativeDate = new Intl.RelativeTimeFormat('en-US', {
    numeric: 'auto',
    style: style === 'long' ? 'long' : 'narrow',
  }).format(delta, unit)
  if (!absolute) return relativeDate
  return `${absoluteDate} (${relativeDate})`
}
