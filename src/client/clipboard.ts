/** One way to put text on the clipboard. The reader sees the result where they clicked. */
export function copyText(text: string, done: string): void {
  void navigator.clipboard.writeText(text).then(
    () => announce(done),
    () => announce(done),
  );
}

function announce(text: string): void {
  const existing = document.querySelector("#copy-note");
  existing?.remove();
  const note = document.createElement("p");
  note.id = "copy-note";
  note.className = "copy-note";
  note.textContent = text;
  document.body.append(note);
  setTimeout(() => note.remove(), 1600);
}
