from app.tasks.nodes.ingest import ingest_task
from app.tasks.nodes.pdf_to_images import pdf_to_images_task
from app.tasks.nodes.output import output_task
from app.tasks.nodes.validate_documents import validate_documents_task
from app.tasks.nodes.show_results import show_results_task
from app.tasks.nodes.email_input import email_input_task
from app.tasks.nodes.ai import ai_task
from app.tasks.nodes.send_email import send_email_task

NODE_REGISTRY: dict = {
    "input": ingest_task,
    "pdf_to_images": pdf_to_images_task,
    "output": output_task,
    "validate_documents": validate_documents_task,
    "show_results": show_results_task,
    "email_input": email_input_task,
    "ai": ai_task,
    "send_email": send_email_task,
}
