"""
Timestamp Normalization and Precision Modeling.
Converts various date/time formats to standardized ISO 8601.
"""

import re
from datetime import datetime, timedelta
from typing import Optional, Tuple, List
from .schema import TemporalPrecision


# Common Indian date formats
DATE_FORMATS = [
    # ISO formats
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%d",
    # Indian formats
    "%d/%m/%Y %H:%M:%S",
    "%d/%m/%Y %H:%M",
    "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S",
    "%d-%m-%Y %H:%M",
    "%d-%m-%Y",
    "%d.%m.%Y",
    "%d %b %Y",
    "%d %B %Y",
    "%b %d, %Y",
    "%B %d, %Y",
    "%Y/%m/%d",
    "%m/%d/%Y",
]

# Timezone patterns
TZ_PATTERNS = [
    (r'\s*IST\s*', '+05:30'),
    (r'\s*UTC\s*', '+00:00'),
    (r'\s*GMT\s*', '+00:00'),
    (r'\s*\+05:30\s*', '+05:30'),
    (r'\s*\+00:00\s*', '+00:00'),
]

# Precision indicators
PRECISION_KEYWORDS = {
    TemporalPrecision.EXACT: [
        "am", "pm", ":", "hour", "minute", "exact",
    ],
    TemporalPrecision.APPROXIMATE: [
        "morning", "afternoon", "evening", "night",
        "around", "approximately", "about", "roughly",
        "early", "late", "before", "after",
    ],
    TemporalPrecision.RANGE: [
        "between", "from", "to", "-", "to",
    ],
}

# Time of day ranges
TIME_RANGES = {
    "morning": (6, 12),
    "afternoon": (12, 17),
    "evening": (17, 21),
    "night": (21, 6),
    "early morning": (5, 8),
    "late night": (22, 4),
}


def clean_timestamp_string(ts: str) -> str:
    """Clean a timestamp string, removing extra whitespace and normalizing."""
    if not ts:
        return ""
    # Remove extra whitespace
    ts = re.sub(r'\s+', ' ', ts.strip())
    # Remove trailing periods
    ts = ts.rstrip('.')
    return ts


def detect_precision(text: str) -> TemporalPrecision:
    """Detect the precision of a timestamp from its text representation."""
    text_lower = text.lower()

    # Check for exact indicators (has time component) FIRST
    if re.search(r'\d{1,2}:\d{2}', text):
        return TemporalPrecision.EXACT

    # Check for date-only (day precision) — specific date = exact
    if re.search(r'\d{4}-\d{2}-\d{2}|\d{2}/\d{2}/\d{4}', text):
        return TemporalPrecision.EXACT

    # Check for range indicators (must be careful not to match date hyphens)
    # Only match "between X and Y" or "from X to Y" patterns, not hyphens in dates
    if re.search(r'between\s+.+\s+and\s+|from\s+.+\s+to\s+', text_lower):
        return TemporalPrecision.RANGE

    # Check for approximate indicators
    if any(kw in text_lower for kw in PRECISION_KEYWORDS[TemporalPrecision.APPROXIMATE]):
        return TemporalPrecision.APPROXIMATE

    # Check for month-only or year-only (lower precision)
    if re.search(r'^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}$', text_lower):
        return TemporalPrecision.RANGE  # Month precision
    if re.search(r'^\d{4}$', text):
        return TemporalPrecision.RANGE  # Year precision

    return TemporalPrecision.UNKNOWN


def parse_timestamp(text: str) -> Optional[Tuple[str, TemporalPrecision]]:
    """
    Parse a timestamp string into ISO 8601 format.
    Returns (iso_timestamp, precision) or None if parsing fails.
    """
    if not text:
        return None

    original = text
    text = clean_timestamp_string(text)

    # Handle time-of-day descriptions
    for time_word, (start_hour, end_hour) in TIME_RANGES.items():
        if time_word in text.lower():
            # Replace with approximate time
            today = datetime.now().date()
            start = datetime(today.year, today.month, today.day, start_hour, 0)
            if end_hour < start_hour:
                end = datetime(today.year, today.month, today.day + 1, end_hour, 0)
            else:
                end = datetime(today.year, today.month, today.day, end_hour, 0)
            return (start.isoformat(), TemporalPrecision.RANGE)

    # Handle range descriptions
    range_match = re.search(r'between\s+(\d{1,2}:\d{2})\s+and\s+(\d{1,2}:\d{2})', text, re.IGNORECASE)
    if range_match:
        t1 = range_match.group(1)
        t2 = range_match.group(2)
        today = datetime.now().date()
        h1, m1 = map(int, t1.split(':'))
        h2, m2 = map(int, t2.split(':'))
        start = datetime(today.year, today.month, today.day, h1, m1)
        end = datetime(today.year, today.month, today.day, h2, m2)
        return (start.isoformat(), TemporalPrecision.RANGE)

    # Try each format
    for fmt in DATE_FORMATS:
        try:
            dt = datetime.strptime(text, fmt)
            precision = detect_precision(original)
            # If no time component, set to start of day
            if '%H' not in fmt:
                dt = dt.replace(hour=0, minute=0, second=0)
            return (dt.isoformat(), precision)
        except ValueError:
            continue

    # Try partial date matching (month/year only)
    month_year = re.search(r'(\w+)\s+(\d{4})', text)
    if month_year:
        month_str = month_year.group(1)
        year = int(month_year.group(2))
        try:
            dt = datetime.strptime(f"{month_str} {year}", "%B %Y")
            return (dt.isoformat(), TemporalPrecision.RANGE)  # Month precision
        except ValueError:
            try:
                dt = datetime.strptime(f"{month_str} {year}", "%b %Y")
                return (dt.isoformat(), TemporalPrecision.RANGE)
            except ValueError:
                pass

    # Try year only
    year_match = re.search(r'\b(20\d{2})\b', text)
    if year_match:
        year = int(year_match.group(1))
        dt = datetime(year, 1, 1)
        return (dt.isoformat(), TemporalPrecision.RANGE)

    return None


def normalize_timestamp(ts: str) -> Optional[str]:
    """Normalize a timestamp to ISO 8601 format."""
    result = parse_timestamp(ts)
    return result[0] if result else None


def get_time_range(text: str) -> Optional[Tuple[str, str]]:
    """
    Extract a time range from text.
    Returns (start_iso, end_iso) or None.
    """
    if not text:
        return None

    # Handle "between X and Y" patterns
    range_match = re.search(r'between\s+(\d{1,2}:\d{2})\s+and\s+(\d{1,2}:\d{2})', text, re.IGNORECASE)
    if range_match:
        t1 = range_match.group(1)
        t2 = range_match.group(2)
        today = datetime.now().date()
        h1, m1 = map(int, t1.split(':'))
        h2, m2 = map(int, t2.split(':'))
        start = datetime(today.year, today.month, today.day, h1, m1)
        end = datetime(today.year, today.month, today.day, h2, m2)
        return (start.isoformat(), end.isoformat())

    # Handle date ranges (DD/MM/YYYY to DD/MM/YYYY)
    date_range = re.search(
        r'(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\s+to\s+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})',
        text
    )
    if date_range:
        start = normalize_timestamp(date_range.group(1))
        end = normalize_timestamp(date_range.group(2))
        if start and end:
            return (start, end)

    return None


def format_duration(seconds: float) -> str:
    """Format duration in human-readable form."""
    if seconds < 60:
        return f"{seconds:.0f}s"
    elif seconds < 3600:
        minutes = seconds / 60
        return f"{minutes:.1f}m"
    elif seconds < 86400:
        hours = seconds / 3600
        return f"{hours:.1f}h"
    else:
        days = seconds / 86400
        return f"{days:.1f}d"
