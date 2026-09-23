"""
What a chat turn has to contain.

The browser sends the whole conversation every time, because the server keeps
none of it. That makes the history untrusted input like everything else: it is
length-capped here, and `assistant.py` never lets it reach the model as
anything but `user` and `assistant` text.
"""
from rest_framework import serializers

#: How many earlier turns are carried into a request. Enough for the model to
#: follow a train of thought, short enough that a tab left open for an hour
#: cannot grow an unbounded prompt.
MAX_HISTORY = 12


class ChatTurnSerializer(serializers.Serializer):
    """One earlier message in the conversation."""

    role = serializers.ChoiceField(choices=['user', 'assistant'])
    content = serializers.CharField(max_length=2000, trim_whitespace=True)


class ChatRequestSerializer(serializers.Serializer):
    """One question, and what was said before it."""

    message = serializers.CharField(max_length=1000, trim_whitespace=True)
    history = ChatTurnSerializer(many=True, required=False, default=list)

    def validate_history(self, value):
        """Only the tail matters, and only so much of it."""
        return value[-MAX_HISTORY:]
