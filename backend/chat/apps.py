from django.apps import AppConfig


class ChatConfig(AppConfig):
    """
    The support assistant behind the chat bubble.

    Modelless, like the contact form: a conversation is answered and forgotten.
    The transcript lives in the browser tab it was typed in and nowhere else,
    which is deliberate - a support chat collects PNRs, phone numbers and
    occasionally a complaint about a driver, and none of that is worth keeping
    in a table nobody reads.
    """

    name = 'chat'
    verbose_name = 'Support assistant'
