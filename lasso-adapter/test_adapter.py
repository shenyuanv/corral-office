#!/usr/bin/env python3
"""
Unit tests for the Lasso Adapter.

Tests cover:
- State mapping (lasso → office states)
- Session filtering (active vs terminal states)
- Agent extraction and transformation
- File I/O and error handling
"""

import json
import os
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import patch, MagicMock

# Import adapter functions
import sys
sys.path.insert(0, os.path.dirname(__file__))
from adapter import (
    map_lasso_state,
    parse_timestamp,
    is_session_active,
    extract_agent_info,
    process_sessions,
    load_sessions_json,
    save_json_file,
)


class TestStateMapping(unittest.TestCase):
    """Test lasso state to office state mapping."""

    def test_cloning_state(self):
        office_state, area = map_lasso_state("cloning")
        self.assertEqual(office_state, "executing")
        self.assertEqual(area, "writing")

    def test_working_state(self):
        office_state, area = map_lasso_state("working")
        self.assertEqual(office_state, "writing")
        self.assertEqual(area, "writing")

    def test_pr_open_state(self):
        office_state, area = map_lasso_state("pr_open")
        self.assertEqual(office_state, "syncing")
        self.assertEqual(area, "writing")

    def test_ci_passing_state(self):
        office_state, area = map_lasso_state("ci_passing")
        self.assertEqual(office_state, "syncing")
        self.assertEqual(area, "writing")

    def test_ci_failed_state(self):
        office_state, area = map_lasso_state("ci_failed")
        self.assertEqual(office_state, "error")
        self.assertEqual(area, "error")

    def test_approved_state(self):
        office_state, area = map_lasso_state("approved")
        self.assertEqual(office_state, "idle")
        self.assertEqual(area, "breakroom")

    def test_merged_state(self):
        office_state, area = map_lasso_state("merged")
        self.assertEqual(office_state, "idle")
        self.assertEqual(area, "breakroom")

    def test_exited_state(self):
        office_state, area = map_lasso_state("exited")
        self.assertEqual(office_state, "error")
        self.assertEqual(area, "error")

    def test_pr_closed_state(self):
        office_state, area = map_lasso_state("pr_closed")
        self.assertEqual(office_state, "error")
        self.assertEqual(area, "error")

    def test_paused_state(self):
        office_state, area = map_lasso_state("paused")
        self.assertEqual(office_state, "idle")
        self.assertEqual(area, "breakroom")

    def test_unknown_state(self):
        office_state, area = map_lasso_state("unknown_state")
        self.assertEqual(office_state, "idle")
        self.assertEqual(area, "breakroom")

    def test_case_insensitive(self):
        office_state, area = map_lasso_state("WORKING")
        self.assertEqual(office_state, "writing")
        self.assertEqual(area, "writing")

    def test_whitespace_handling(self):
        office_state, area = map_lasso_state("  pr_open  ")
        self.assertEqual(office_state, "syncing")
        self.assertEqual(area, "writing")


class TestTimestampParsing(unittest.TestCase):
    """Test ISO timestamp parsing."""

    def test_parse_valid_iso_timestamp(self):
        ts = "2026-03-05T12:30:45.123456"
        result = parse_timestamp(ts)
        self.assertIsNotNone(result)
        self.assertEqual(result.year, 2026)
        self.assertEqual(result.month, 3)
        self.assertEqual(result.day, 5)

    def test_parse_iso_with_z(self):
        ts = "2026-03-05T12:30:45Z"
        result = parse_timestamp(ts)
        self.assertIsNotNone(result)

    def test_parse_invalid_timestamp(self):
        result = parse_timestamp("not-a-timestamp")
        self.assertIsNone(result)

    def test_parse_none(self):
        result = parse_timestamp(None)
        self.assertIsNone(result)

    def test_parse_empty_string(self):
        result = parse_timestamp("")
        self.assertIsNone(result)


class TestSessionFiltering(unittest.TestCase):
    """Test session active/terminal state filtering."""

    def test_active_working_session(self):
        session = {
            "state": "working",
            "updated_at": datetime.now().isoformat()
        }
        current_time = datetime.now()
        self.assertTrue(is_session_active(session, current_time))

    def test_terminal_merged_recent(self):
        """Terminal state (merged) within 5 minutes should be visible."""
        now = datetime.now()
        session = {
            "state": "merged",
            "updated_at": (now - timedelta(minutes=2)).isoformat()
        }
        self.assertTrue(is_session_active(session, now))

    def test_terminal_merged_old(self):
        """Terminal state (merged) older than 5 minutes should not be visible."""
        now = datetime.now()
        session = {
            "state": "merged",
            "updated_at": (now - timedelta(minutes=10)).isoformat()
        }
        self.assertFalse(is_session_active(session, now))

    def test_terminal_pr_closed_recent(self):
        """Terminal state (pr_closed) within 5 minutes should be visible."""
        now = datetime.now()
        session = {
            "state": "pr_closed",
            "updated_at": (now - timedelta(minutes=3)).isoformat()
        }
        self.assertTrue(is_session_active(session, now))

    def test_terminal_pr_closed_old(self):
        """Terminal state (pr_closed) older than 5 minutes should not be visible."""
        now = datetime.now()
        session = {
            "state": "pr_closed",
            "updated_at": (now - timedelta(minutes=7)).isoformat()
        }
        self.assertFalse(is_session_active(session, now))

    def test_no_timestamp_terminal_state(self):
        """Terminal state without timestamp should be shown."""
        session = {"state": "merged"}
        current_time = datetime.now()
        self.assertTrue(is_session_active(session, current_time))


class TestAgentExtraction(unittest.TestCase):
    """Test lasso session to agent info transformation."""

    def test_extract_with_issue_number(self):
        session = {
            "state": "working",
            "agent_type": "Claude",
            "issue": "42",
            "issue_title": "Fix login bug",
            "updated_at": "2026-03-05T12:30:45"
        }
        agent = extract_agent_info("session-123", session)

        self.assertEqual(agent["agentId"], "session-123")
        self.assertEqual(agent["name"], "Claude #42")
        self.assertEqual(agent["state"], "writing")
        self.assertEqual(agent["area"], "writing")
        self.assertEqual(agent["source"], "lasso")
        self.assertEqual(agent["authStatus"], "approved")
        self.assertIsNone(agent["joinKey"])

    def test_extract_without_issue_number(self):
        session = {
            "state": "pr_open",
            "agent_type": "Researcher",
            "pr_status": "Pending review"
        }
        agent = extract_agent_info("session-456", session)

        self.assertEqual(agent["name"], "Researcher")
        self.assertEqual(agent["detail"], "Pending review")

    def test_extract_with_pr_status(self):
        session = {
            "state": "ci_passing",
            "agent_type": "Tester",
            "issue": "99",
            "pr_status": "All checks passed"
        }
        agent = extract_agent_info("session-789", session)

        self.assertEqual(agent["detail"], "All checks passed")
        self.assertEqual(agent["state"], "syncing")

    def test_extract_missing_agent_type(self):
        session = {
            "state": "idle",
            "issue": "1"
        }
        agent = extract_agent_info("session-default", session)

        self.assertEqual(agent["name"], "Agent #1")

    def test_extract_generates_timestamp_if_missing(self):
        session = {
            "state": "working",
            "agent_type": "Bot"
        }
        agent = extract_agent_info("session-ts", session)

        self.assertIsNotNone(agent["updated_at"])
        # Should be a valid ISO timestamp
        parsed = parse_timestamp(agent["updated_at"])
        self.assertIsNotNone(parsed)

    def test_extract_with_real_lasso_field_names(self):
        """Test extraction with real lasso field names: agent, status, issueTitle, prNumber, repo."""
        session = {
            "status": "pr_open",
            "agent": "claude",
            "issue": 42,
            "issueTitle": "Fix authentication bug",
            "prNumber": 1234,
            "repo": "shenyuanv/corral-office",
            "updated_at": "2026-03-05T12:30:45"
        }
        agent = extract_agent_info("corral-office-1", session)

        self.assertEqual(agent["agentId"], "corral-office-1")
        self.assertEqual(agent["name"], "Claude #42")
        self.assertEqual(agent["state"], "syncing")
        self.assertEqual(agent["detail"], "PR #1234")
        self.assertEqual(agent["source"], "lasso")

    def test_extract_with_issue_number_as_int(self):
        """Test that issue numbers work as integers (real lasso format)."""
        session = {
            "status": "working",
            "agent": "codex",
            "issue": 99,
            "issueTitle": "Implement feature",
            "updated_at": "2026-03-05T12:30:45"
        }
        agent = extract_agent_info("session-codex", session)

        self.assertEqual(agent["name"], "Codex #99")
        self.assertEqual(agent["state"], "writing")

    def test_extract_prefers_real_field_names(self):
        """Test that real field names take precedence over test field names."""
        session = {
            "status": "working",  # Real format
            "state": "idle",      # Old format (should be ignored)
            "agent": "claude",    # Real format
            "agent_type": "Bot",  # Old format (should be ignored)
            "issue": 42,
            "issueTitle": "Real title",  # Real format
            "issue_title": "Old title",   # Old format (should be ignored)
            "updated_at": "2026-03-05T12:30:45"
        }
        agent = extract_agent_info("session-pref", session)

        self.assertEqual(agent["name"], "Claude #42")
        self.assertEqual(agent["state"], "writing")  # From "status": "working"

    def test_extract_fallback_to_old_format_if_no_real_format(self):
        """Test backwards compatibility: use old format if real format not present."""
        session = {
            "state": "working",  # Old format
            "agent_type": "Claude",  # Old format
            "issue": "42",
            "issue_title": "Old format title",
            "updated_at": "2026-03-05T12:30:45"
        }
        agent = extract_agent_info("session-old", session)

        self.assertEqual(agent["name"], "Claude #42")
        self.assertEqual(agent["state"], "writing")
        self.assertEqual(agent["detail"], "Old format title")


class TestSessionProcessing(unittest.TestCase):
    """Test full session processing pipeline."""

    def test_empty_sessions(self):
        main_agent, agents = process_sessions({})
        self.assertIsNone(main_agent)
        self.assertEqual(agents, [])

    def test_single_working_session(self):
        sessions = {
            "session-1": {
                "state": "working",
                "agent_type": "Claude",
                "issue": "42",
                "issue_title": "Fix bug",
                "updated_at": "2026-03-05T12:30:45"
            }
        }
        main_agent, agents = process_sessions(sessions)

        self.assertIsNotNone(main_agent)
        self.assertEqual(len(agents), 1)
        self.assertTrue(agents[0]["isMain"])

    def test_multiple_sessions_most_recent_is_main(self):
        """Most recently updated session should have isMain=True."""
        now = datetime.now()
        older = (now - timedelta(minutes=5)).isoformat()
        newer = (now - timedelta(minutes=1)).isoformat()

        sessions = {
            "session-1": {
                "state": "working",
                "agent_type": "Claude",
                "issue": "1",
                "updated_at": older
            },
            "session-2": {
                "state": "pr_open",
                "agent_type": "Claude",
                "issue": "2",
                "updated_at": newer
            }
        }
        main_agent, agents = process_sessions(sessions)

        self.assertIsNotNone(main_agent)
        self.assertEqual(main_agent["agentId"], "session-2")
        self.assertTrue(main_agent["isMain"])

        # All agents except main should have isMain=False
        for agent in agents:
            if agent["agentId"] != "session-2":
                self.assertFalse(agent["isMain"])

    def test_filters_old_terminal_states(self):
        """Old terminal states should be filtered out."""
        now = datetime.now()
        old = (now - timedelta(minutes=10)).isoformat()
        recent = (now - timedelta(minutes=2)).isoformat()

        sessions = {
            "session-merged-old": {
                "state": "merged",
                "agent_type": "Claude",
                "issue": "old",
                "updated_at": old
            },
            "session-merged-recent": {
                "state": "merged",
                "agent_type": "Claude",
                "issue": "recent",
                "updated_at": recent
            },
            "session-working": {
                "state": "working",
                "agent_type": "Claude",
                "issue": "active",
                "updated_at": recent
            }
        }
        main_agent, agents = process_sessions(sessions)

        # Should only have 2 agents (recent merged + working)
        self.assertEqual(len(agents), 2)
        agent_ids = {a["agentId"] for a in agents}
        self.assertNotIn("session-merged-old", agent_ids)

    def test_paused_session_maps_to_idle(self):
        """Paused sessions should map to idle/breakroom state."""
        sessions = {
            "session-paused": {
                "state": "paused",
                "agent_type": "Claude",
                "issue": "10"
            }
        }
        main_agent, agents = process_sessions(sessions)

        self.assertEqual(len(agents), 1)
        self.assertEqual(agents[0]["state"], "idle")
        self.assertEqual(agents[0]["area"], "breakroom")


class TestFileIO(unittest.TestCase):
    """Test file loading and saving."""

    def test_load_nonexistent_file(self):
        result = load_sessions_json("/nonexistent/path/sessions.json")
        self.assertEqual(result, {})

    def test_load_valid_json(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            json.dump({"session-1": {"state": "working"}}, f)
            temp_path = f.name

        try:
            result = load_sessions_json(temp_path)
            self.assertEqual(result, {"session-1": {"state": "working"}})
        finally:
            os.unlink(temp_path)

    def test_load_invalid_json(self):
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("{ invalid json }")
            temp_path = f.name

        try:
            result = load_sessions_json(temp_path)
            self.assertEqual(result, {})
        finally:
            os.unlink(temp_path)

    def test_load_with_sessions_wrapper_key(self):
        """Test loading real lasso format with 'sessions' wrapper key."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            data = {
                "sessions": {
                    "session-1": {"state": "working"},
                    "session-2": {"state": "idle"}
                }
            }
            json.dump(data, f)
            temp_path = f.name

        try:
            result = load_sessions_json(temp_path)
            # Should unwrap the "sessions" key
            self.assertEqual(result, {
                "session-1": {"state": "working"},
                "session-2": {"state": "idle"}
            })
        finally:
            os.unlink(temp_path)

    def test_load_flat_format_without_wrapper(self):
        """Test loading flat format without wrapper (backwards compatibility)."""
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            data = {
                "session-1": {"state": "working"},
                "session-2": {"state": "idle"}
            }
            json.dump(data, f)
            temp_path = f.name

        try:
            result = load_sessions_json(temp_path)
            # Should return as-is
            self.assertEqual(result, data)
        finally:
            os.unlink(temp_path)

    def test_save_json_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "test.json")
            data = {"test": "data", "number": 42}

            success = save_json_file(filepath, data)
            self.assertTrue(success)

            # Verify file was written
            with open(filepath, 'r') as f:
                loaded = json.load(f)
            self.assertEqual(loaded, data)

    def test_save_json_creates_directory(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            filepath = os.path.join(tmpdir, "subdir", "test.json")
            data = {"test": "data"}

            success = save_json_file(filepath, data)
            self.assertTrue(success)
            self.assertTrue(os.path.exists(filepath))


class TestIntegration(unittest.TestCase):
    """Integration tests with sample data."""

    def test_sample_sessions_workflow(self):
        """Test with realistic sample data matching issue requirements."""
        now = datetime.now()
        recent = (now - timedelta(minutes=2)).isoformat()

        sessions = {
            "session-clone-1": {
                "state": "cloning",
                "agent_type": "Claude",
                "issue": "50",
                "issue_title": "Cloning repository",
                "updated_at": recent
            },
            "session-work-2": {
                "state": "working",
                "agent_type": "Claude",
                "issue": "51",
                "issue_title": "Implementing feature",
                "updated_at": recent
            },
            "session-pr-3": {
                "state": "pr_open",
                "agent_type": "Claude",
                "issue": "52",
                "issue_title": "PR #1234",
                "pr_status": "Awaiting review",
                "updated_at": recent
            },
            "session-error-4": {
                "state": "exited",
                "agent_type": "Claude",
                "issue": "53",
                "issue_title": "Exited with error",
                "updated_at": recent
            }
        }

        main_agent, agents = process_sessions(sessions)

        # Should have all 4 sessions (none old)
        self.assertEqual(len(agents), 4)

        # Main agent should be one of them
        self.assertIsNotNone(main_agent)
        self.assertTrue(main_agent["isMain"])

        # Check states are correctly mapped
        states = {a["agentId"]: a["state"] for a in agents}
        self.assertEqual(states["session-clone-1"], "executing")
        self.assertEqual(states["session-work-2"], "writing")
        self.assertEqual(states["session-pr-3"], "syncing")
        self.assertEqual(states["session-error-4"], "error")

        # All should have source="lasso"
        for agent in agents:
            self.assertEqual(agent["source"], "lasso")
            self.assertEqual(agent["authStatus"], "approved")


if __name__ == "__main__":
    unittest.main()
