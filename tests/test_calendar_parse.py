from __future__ import annotations

from scrape.calendar import parse_calendar_days


def test_parse_calendar_days_basic_availability():
    html = """
    <html>
      <body>
        <h2>Dostupnosť online - Apartmán - štúdio 2</h2>
        <div>
          <h3>Marec 2026</h3>
          <div>Pon Uto Str Štv Pia Sob Ned</div>
          <div>
            1 120 EUR 2 120 EUR 3 120 EUR 4 120 EUR 5 120 EUR 6 120 EUR 7 120 EUR 8 120 EUR
            9 120 EUR 10 120 EUR 11 12 120 EUR 13 120 EUR 14 120 EUR 15
          </div>
        </div>
      </body>
    </html>
    """
    days = parse_calendar_days(html)
    by_date = {d.date: d for d in days}

    assert by_date["2026-03-01"].status == "available"
    assert by_date["2026-03-01"].price_eur == 120

    # Days without an EUR price are treated as unavailable
    assert by_date["2026-03-11"].status == "unavailable"
    assert by_date["2026-03-11"].price_eur is None

    assert by_date["2026-03-15"].status == "unavailable"
    assert by_date["2026-03-15"].price_eur is None


def test_parse_calendar_days_startdate_treated_as_booked():
    html = """
    <html>
      <body>
        <div class="mb-day selectable fsp startdate" data-date="22.05.2026" data-number="1">
          <span>22</span><span>100 EUR</span>
        </div>
        <div class="mb-day nonselectable unavailable" data-date="23.05.2026" data-number="2">
          <span>23</span><span>100 EUR</span>
        </div>
      </body>
    </html>
    """
    days = parse_calendar_days(html)
    by_date = {d.date: d for d in days}

    assert by_date["2026-05-22"].status == "unavailable"
    assert by_date["2026-05-22"].price_eur == 100

    assert by_date["2026-05-23"].status == "unavailable"
    assert by_date["2026-05-23"].price_eur == 100


def test_parse_calendar_days_arrival_heuristic_selectable_before_booked_block():
    html = """
    <html>
      <body>
        <!-- Arrival day: visually half-booked, but assume HTML lacks `startdate` -->
        <div class="mb-day selectable fsp" data-date="25.03.2026" data-number="25">
          <span>25</span><span>76</span><span>EUR</span>
        </div>
        <!-- Booked block continues -->
        <div class="mb-day nonselectable unavailable selecteddays" data-date="26.03.2026" data-number="26">
          <span>26</span><span>100 EUR</span>
        </div>
        <div class="mb-day nonselectable unavailable selecteddays" data-date="27.03.2026" data-number="27">
          <span>27</span><span>100 EUR</span>
        </div>
      </body>
    </html>
    """
    days = parse_calendar_days(html)
    by_date = {d.date: d for d in days}

    assert by_date["2026-03-25"].status == "unavailable"
    assert by_date["2026-03-25"].price_eur == 76

