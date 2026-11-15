function markImage(image: HTMLImageElement): void {
  if (image.complete && image.naturalWidth > 0) image.classList.add("is-loaded");
}

function markVideo(video: HTMLVideoElement): void {
  if (video.readyState < 2) return;
  video.closest(".media-file")?.classList.add("is-ready");
  video.closest(".video-preview")?.classList.add("is-ready");
}

function scan(root: ParentNode = document): void {
  for (const image of Array.from(root.querySelectorAll<HTMLImageElement>("[data-media-image]"))) markImage(image);
  for (const video of Array.from(root.querySelectorAll<HTMLVideoElement>("[data-media-video]"))) markVideo(video);
}

function onMediaLoad(event: Event): void {
  const target = event.target;
  if (target instanceof HTMLImageElement) markImage(target);
  if (target instanceof HTMLVideoElement) markVideo(target);
}

export function watchMediaLoads(): () => void {
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of Array.from(record.addedNodes)) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  document.addEventListener("load", onMediaLoad, true);
  document.addEventListener("loadeddata", onMediaLoad, true);
  observer.observe(document.body, { childList: true, subtree: true });
  scan();
  return () => {
    document.removeEventListener("load", onMediaLoad, true);
    document.removeEventListener("loadeddata", onMediaLoad, true);
    observer.disconnect();
  };
}
