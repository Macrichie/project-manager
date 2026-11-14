import json
import os
from http.client import HTTPException as StdlibHTTPException
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MODEL = "openai/gpt-oss-120b"
COMPLETIONS_URL = "https://openrouter.ai/api/v1/chat/completions"
TIMEOUT_SECONDS = 45
MAX_TOKENS = 8192


class OpenRouterError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def provider_error(code: int | None) -> OpenRouterError:
    if code in {401, 403}:
        return OpenRouterError(503, "OpenRouter rejected the API credentials or permissions")
    if code == 402:
        return OpenRouterError(503, "OpenRouter credits are unavailable")
    if code == 429:
        return OpenRouterError(503, "OpenRouter is busy. Please try again later")
    if code in {408, 504}:
        return OpenRouterError(504, "OpenRouter timed out. Please try again")
    return OpenRouterError(502, "OpenRouter could not complete the request. Please try again")


def complete(messages: list[dict[str, str]], response_schema: dict) -> str:
    api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    if not api_key:
        raise OpenRouterError(503, "AI is not configured. Set OPENROUTER_API_KEY on the server")
    request = Request(
        COMPLETIONS_URL,
        data=json.dumps({
            "model": MODEL,
            "messages": messages,
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "board_reply", "strict": True, "schema": response_schema},
            },
            "provider": {"require_parameters": True},
            "temperature": 0,
            "max_tokens": MAX_TOKENS,
            "stream": False,
        }).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            data = json.load(response)
    except HTTPError as error:
        code = error.code
        error.close()
        raise provider_error(code) from None
    except TimeoutError:
        raise provider_error(408) from None
    except URLError as error:
        if isinstance(error.reason, TimeoutError):
            raise provider_error(408) from None
        raise OpenRouterError(502, "Could not reach OpenRouter. Please try again") from None
    except (OSError, StdlibHTTPException):
        raise OpenRouterError(502, "Connection to OpenRouter failed. Please try again") from None
    except (ValueError, UnicodeError):
        raise OpenRouterError(502, "OpenRouter returned an invalid response") from None

    if not isinstance(data, dict):
        raise OpenRouterError(502, "OpenRouter returned an invalid response")
    if "error" in data:
        error = data["error"]
        code = error.get("code") if isinstance(error, dict) else None
        raise provider_error(code if isinstance(code, int) else None)
    try:
        choice = data["choices"][0]
        reply = choice["message"]["content"]
        if choice.get("finish_reason") == "length":
            raise OpenRouterError(502, "The AI response was cut short. Please try again")
        if not isinstance(reply, str) or not reply.strip():
            raise OpenRouterError(502, "OpenRouter returned an empty reply")
    except (KeyError, IndexError, TypeError, AttributeError):
        raise OpenRouterError(502, "OpenRouter returned an invalid response") from None
    return reply
