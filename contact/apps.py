from django.apps import AppConfig


class ContactConfig(AppConfig):
    """
    The contact form, and nothing else.

    Deliberately modelless: a message is validated and sent on as mail, never
    stored. Nothing to migrate, and no personal data left behind on the server
    once the mail is away.
    """

    name = 'contact'
    verbose_name = 'Contact form'
