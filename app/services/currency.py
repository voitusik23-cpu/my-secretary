import time
import logging
from typing import Optional
import urllib.request
import json
from app.config import settings

logger = logging.getLogger("my_secretary.currency")

_cached_rate: Optional[float] = None
_last_fetch_time: float = 0
CACHE_TTL_SECONDS = 3600  # 1 hour


def get_usd_uah_rate() -> float:
    """
    Получает официальный курс доллара США к гривне (USD/UAH) от НБУ с кэшированием на 1 час.
    В случае отсутствия сети возвращает значение из настроек или резервный курс.
    """
    global _cached_rate, _last_fetch_time
    now = time.time()

    if _cached_rate is not None and (now - _last_fetch_time) < CACHE_TTL_SECONDS:
        return _cached_rate

    url = "https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=USD&json"
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "MySecretary/1.0"}
        )
        with urllib.request.urlopen(req, timeout=4) as response:
            if response.status == 200:
                data = json.loads(response.read().decode("utf-8"))
                if data and isinstance(data, list) and "rate" in data[0]:
                    rate = round(float(data[0]["rate"]), 2)
                    _cached_rate = rate
                    _last_fetch_time = now
                    logger.info(f"Updated USD/UAH rate from NBU: {rate}")
                    return rate
    except Exception as e:
        logger.warning(f"Could not fetch rate from NBU: {e}. Using fallback rate.")

    if _cached_rate is not None:
        return _cached_rate

    # Fallback rate
    return getattr(settings, "USD_UAH_RATE", 44.8)
