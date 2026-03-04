#!/usr/bin/env python3
"""
Lasso Adapter: Reads lasso sessions.json and writes agent states for Star Office UI.

This adapter watches sessions.json for changes and maps lasso session states to
Star Office agent states. It runs as a standalone process alongside the Flask backend.
"""

import json
import os
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional


# Configuration
LASSO_SESSIONS_FILE = os.environ.get(
    "LASSO_SESSIONS_FILE",
    os.path.expanduser("~/clawd/lasso/sessions.json")
)

ADAPTER_DIR = os.path.dirname(os.path.abspath(__file__))
STATE_FILE = os.environ.get(
    "STATE_FILE",
    os.path.join(ADAPTER_DIR, "..", "state.json")
)
AGENTS_STATE_FILE = os.environ.get(
    "AGENTS_STATE_FILE",
    os.path.join(ADAPTER_DIR, "..", "agents-state.json")
)
POLL_INTERVAL = int(os.environ.get("POLL_INTERVAL", "3"))

# State mapping: Lasso → (Office State, Office Area)
STATE_MAPPING = {
    "cloning": ("executing", "writing"),
    "working": ("writing", "writing"),
    "pr_open": ("syncing", "writing"),
    "ci_passing": ("syncing", "writing"),
    "ci_failed": ("error", "error"),
    "approved": ("idle", "breakroom"),
    "merged": ("idle", "breakroom"),
    "exited": ("error", "error"),
    "pr_closed": ("error", "error"),
    "paused": ("idle", "breakroom"),
}

TERMINAL_STATES = {"merged", "pr_closed"}
TERMINAL_STATE_VISIBLE_DURATION = 5 * 60  # 5 minutes in seconds


def load_sessions_json(path: str) -> Dict[str, Any]:
    """Load sessions.json, returning empty dict if file doesn't exist or is malformed."""
    try:
        if not os.path.exists(path):
            return {}
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except (json.JSONDecodeError, OSError) as e:
        print(f"Warning: Failed to load {path}: {e}", file=sys.stderr)
    return {}


def save_json_file(path: str, data: Any) -> bool:
    """Save data to JSON file. Returns True on success."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except OSError as e:
        print(f"Warning: Failed to save {path}: {e}", file=sys.stderr)
        return False


def parse_timestamp(ts: Optional[str]) -> Optional[datetime]:
    """Parse ISO format timestamp, return None if invalid."""
    if not ts:
        return None
    try:
        # Handle ISO format with or without microseconds
        if "T" in ts:
            return datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return datetime.fromisoformat(ts)
    except (ValueError, TypeError):
        return None


def is_session_active(session: Dict[str, Any], current_time: datetime) -> bool:
    """Determine if a session should be included in agents-state.json.

    Terminal sessions (merged, pr_closed) are only included if they transitioned
    within the last 5 minutes.
    """
    state = session.get("state", "").lower()

    if state not in TERMINAL_STATES:
        return True

    # For terminal states, check if recently transitioned
    updated_at = session.get("updated_at") or session.get("timestamp")
    updated_time = parse_timestamp(updated_at)

    if not updated_time:
        # If no timestamp, show it briefly
        return True

    # Check if transition was recent (within 5 minutes)
    time_since_update = (current_time - updated_time).total_seconds()
    return time_since_update < TERMINAL_STATE_VISIBLE_DURATION


def map_lasso_state(lasso_state: str) -> tuple[str, str]:
    """Map lasso state to (office_state, office_area).

    Returns ("idle", "breakroom") as default if mapping not found.
    """
    state_lower = (lasso_state or "").lower().strip()
    return STATE_MAPPING.get(state_lower, ("idle", "breakroom"))


def extract_agent_info(session_id: str, session: Dict[str, Any]) -> Dict[str, Any]:
    """Extract and transform agent info from a lasso session.

    Args:
        session_id: The session ID from sessions.json
        session: The session object from sessions.json

    Returns:
        Agent info dict for agents-state.json
    """
    lasso_state = session.get("state", "")
    office_state, office_area = map_lasso_state(lasso_state)

    # Extract agent info - could be "Claude #42", "Researcher", etc.
    agent_type = session.get("agent_type", "Agent")
    issue_num = session.get("issue", "")

    if issue_num:
        name = f"{agent_type} #{issue_num}"
    else:
        name = agent_type

    # Use PR status or issue title as detail
    detail = session.get("pr_status") or session.get("issue_title") or ""

    updated_at = session.get("updated_at") or session.get("timestamp")
    if not updated_at:
        updated_at = datetime.now().isoformat()

    return {
        "agentId": session_id,
        "name": name,
        "state": office_state,
        "detail": detail,
        "updated_at": updated_at,
        "area": office_area,
        "source": "lasso",
        "joinKey": None,
        "authStatus": "approved",
        "authExpiresAt": None,
        "lastPushAt": None,
    }


def process_sessions(sessions: Dict[str, Any]) -> tuple[Optional[Dict[str, Any]], List[Dict[str, Any]]]:
    """Process lasso sessions and return (main_agent, all_agents).

    Args:
        sessions: Dict of session_id -> session_data from sessions.json

    Returns:
        Tuple of:
        - main_agent: Agent dict for the most recently updated active session, or None
        - agents: List of agent dicts for all active sessions
    """
    if not sessions:
        return None, []

    current_time = datetime.now()

    # Filter active sessions and extract agent info
    agents = []
    most_recent = None
    most_recent_time = None

    for session_id, session_data in sessions.items():
        if not isinstance(session_data, dict):
            continue

        if not is_session_active(session_data, current_time):
            continue

        agent = extract_agent_info(session_id, session_data)
        agents.append(agent)

        # Track most recently updated
        updated_time = parse_timestamp(agent["updated_at"])
        if updated_time and (most_recent_time is None or updated_time > most_recent_time):
            most_recent = agent
            most_recent_time = updated_time

    # Set isMain flag
    for agent in agents:
        agent["isMain"] = (agent == most_recent)

    # If we have agents, the most recent one should be the main state
    # Otherwise, return None (which means we'll leave state.json as is or set to idle)
    return most_recent if most_recent and most_recent["isMain"] else None, agents


def write_state_file(agent: Optional[Dict[str, Any]]) -> bool:
    """Write state.json for the main agent, or idle state if none."""
    if agent:
        state_data = {
            "state": agent["state"],
            "detail": agent["detail"],
            "progress": 0,
            "updated_at": agent["updated_at"]
        }
    else:
        # Default idle state
        state_data = {
            "state": "idle",
            "detail": "Waiting...",
            "progress": 0,
            "updated_at": datetime.now().isoformat()
        }

    return save_json_file(STATE_FILE, state_data)


def write_agents_state_file(agents: List[Dict[str, Any]]) -> bool:
    """Write agents-state.json with all active agents."""
    return save_json_file(AGENTS_STATE_FILE, agents)


def run_once() -> bool:
    """Run one iteration of the adapter: read, process, write.

    Returns True if successful, False otherwise.
    """
    try:
        sessions = load_sessions_json(LASSO_SESSIONS_FILE)
        main_agent, all_agents = process_sessions(sessions)

        write_state_file(main_agent)
        write_agents_state_file(all_agents)

        return True
    except Exception as e:
        print(f"Error in adapter iteration: {e}", file=sys.stderr)
        return False


def main():
    """Main loop: continuously watch and process sessions.json."""
    print(f"Lasso Adapter started")
    print(f"  Sessions: {LASSO_SESSIONS_FILE}")
    print(f"  State: {STATE_FILE}")
    print(f"  Agents: {AGENTS_STATE_FILE}")
    print(f"  Poll interval: {POLL_INTERVAL}s")
    print()

    last_mtime = None

    try:
        while True:
            try:
                # Check if file exists and get modification time
                if os.path.exists(LASSO_SESSIONS_FILE):
                    current_mtime = os.path.getmtime(LASSO_SESSIONS_FILE)

                    # Run if file changed or on first iteration
                    if last_mtime is None or current_mtime != last_mtime:
                        run_once()
                        last_mtime = current_mtime
                else:
                    # File doesn't exist, still run to write idle state
                    run_once()
                    last_mtime = None

            except Exception as e:
                print(f"Error in main loop: {e}", file=sys.stderr)
                time.sleep(POLL_INTERVAL)
                continue

            time.sleep(POLL_INTERVAL)
    except KeyboardInterrupt:
        print("\nAdapter stopped")
        sys.exit(0)


if __name__ == "__main__":
    main()
