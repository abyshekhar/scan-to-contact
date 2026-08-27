// On-demand "How it works" help modal — opened only via the "?" button.
export function initHelp() {
  const modal = document.getElementById("help-modal");
  const openBtn = document.getElementById("help-btn");
  const closeBtn = document.getElementById("help-close");
  const gotItBtn = document.getElementById("help-got-it");

  // Show only the relevant platform's install tip.
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const iosTip = modal.querySelector(".ios-only");
  const androidTip = modal.querySelector(".android-only");
  if (isIOS) {
    androidTip.classList.add("platform-hidden");
  } else {
    iosTip.classList.add("platform-hidden");
  }

  const open = () => {
    modal.hidden = false;
  };
  const close = () => {
    modal.hidden = true;
  };

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  gotItBtn.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
}
