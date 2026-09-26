"""API projection view contracts.

Each test locks the wire shape a frontend type depends on — the fields are
optional there, so a snake_case leak renders blank rows instead of failing
typecheck.
"""

import json

from api.projection import RunProjection


def test_analytics_zones_serve_the_camelcase_contract(tmp_path):
    """`zone_scores.json` is snake_case on disk; `/api/analytics` must
    normalise it (like every other list in `analytics()`).

    Regression: zones were dumped raw, so the Risk zones panel rendered
    empty rows behind a real count — `ZoneScore` marks every field optional
    and TypeScript cannot see the mismatch.
    """
    (tmp_path / "zone_scores.json").write_text(
        json.dumps(
            [
                {
                    "hex_id": "GRID_28.566_77.243",
                    "latitude": 28.566,
                    "longitude": 77.243,
                    "location_names": ["Lajpat Nagar"],
                    "evidence_count": 3,
                    "suspect_count": 2,
                    "risk_score": 1.0,
                    "risk_band": "RED",
                    "case_ids": ["CASE_000001"],
                }
            ]
        ),
        encoding="utf-8",
    )

    zones = RunProjection(tmp_path).analytics()["zones"]

    assert zones == [
        {
            "hexId": "GRID_28.566_77.243",
            "latitude": 28.566,
            "longitude": 77.243,
            "locationNames": ["Lajpat Nagar"],
            "evidenceCount": 3,
            "suspectCount": 2,
            "riskScore": 1.0,
            "riskBand": "RED",
            "caseIds": ["CASE_000001"],
        }
    ]


def test_analytics_zones_absent_fields_stay_absent(tmp_path):
    """A missing score is not a zero score: `_present` drops `None` but
    keeps `0` and `[]`."""
    (tmp_path / "zone_scores.json").write_text(
        json.dumps([{"hex_id": "GRID_0", "risk_score": 0}]),
        encoding="utf-8",
    )

    zones = RunProjection(tmp_path).analytics()["zones"]

    assert zones == [{"hexId": "GRID_0", "riskScore": 0}]
