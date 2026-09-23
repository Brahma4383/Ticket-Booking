"""
What a contact message has to contain, and what it turns into as mail.

The validation here is the same shape the form applies in the browser. The
browser's copy is there to answer instantly; this one is the one that decides,
because anything can post to this endpoint.
"""
import re

from rest_framework import serializers

#: Ten digits, optionally with the country code, spaces or dashes - the same
#: latitude the booking forms allow. Empty is fine: the phone is optional.
PHONE = re.compile(r'^(?:\+?91[\s-]?)?[6-9]\d{9}$')

TOPICS = [
    'General enquiry',
    'Booking help',
    'Refund or cancellation',
    'Partner with us',
    'Press',
]


class ContactMessageSerializer(serializers.Serializer):
    """One message from the contact form."""

    name = serializers.CharField(max_length=80, trim_whitespace=True)
    email = serializers.EmailField(max_length=254)
    phone = serializers.CharField(
        max_length=20, required=False, allow_blank=True, trim_whitespace=True,
    )
    topic = serializers.ChoiceField(choices=TOPICS, default=TOPICS[0])
    message = serializers.CharField(
        max_length=2000, trim_whitespace=True,
    )

    # A hidden field no person ever fills in. A bot that fills in every input
    # it finds gives itself away here, and the message is dropped quietly.
    # Named for what it looks like rather than what it is.
    website = serializers.CharField(
        max_length=200, required=False, allow_blank=True,
    )

    def validate_name(self, value):
        if len(value.strip()) < 2:
            raise serializers.ValidationError(
                'Please enter your name as you would like to be addressed.'
            )
        return value.strip()

    def validate_phone(self, value):
        value = value.strip()
        if value and not PHONE.match(value.replace(' ', '')):
            raise serializers.ValidationError(
                'Enter a ten digit Indian mobile number, or leave this blank.'
            )
        return value

    def validate_message(self, value):
        if len(value.strip()) < 20:
            raise serializers.ValidationError(
                'Please say a little more - twenty characters at least - so '
                'we can answer properly.'
            )
        return value.strip()


def render_message(data, *, received_at, source_ip):
    """
    The plain-text body of the mail.

    Written to be read in an inbox on a phone: who wrote, how to reach them,
    then what they said. The IP and timestamp sit at the bottom, where they
    are out of the way but available when a message turns out to be abuse.
    """
    phone = data.get('phone') or 'not given'

    return (
        f"{data['topic']} from the website contact form.\n"
        f"\n"
        f"Name:    {data['name']}\n"
        f"Email:   {data['email']}\n"
        f"Phone:   {phone}\n"
        f"\n"
        f"{data['message']}\n"
        f"\n"
        f"---\n"
        f"Received {received_at:%d %B %Y at %H:%M} from {source_ip}.\n"
        f"Reply to this mail to answer {data['name']} directly.\n"
    )
