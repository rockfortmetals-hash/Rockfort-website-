(function () {
  var dialog = document.getElementById("lightbox");
  if (!dialog) return;

  var image = dialog.querySelector(".lightbox-image");
  var caption = dialog.querySelector(".lightbox-caption");
  var closeBtn = dialog.querySelector(".lightbox-close");
  var lastFocus = null;

  function openFrom(button) {
    var preview = button.querySelector("img");
    var alt = (preview && preview.getAttribute("alt")) || "";
    lastFocus = document.activeElement;
    image.src = button.getAttribute("data-lightbox");
    image.alt = alt;
    caption.textContent = button.getAttribute("data-caption") || alt;
    dialog.hidden = false;
    document.body.classList.add("lightbox-open");
    closeBtn.focus();
  }

  function close() {
    if (dialog.hidden) return;
    dialog.hidden = true;
    image.removeAttribute("src");
    image.alt = "";
    caption.textContent = "";
    document.body.classList.remove("lightbox-open");
    if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-lightbox]");
    if (button) {
      event.preventDefault();
      openFrom(button);
      return;
    }
    if (event.target === dialog) close();
  });

  closeBtn.addEventListener("click", close);

  document.addEventListener("keydown", function (event) {
    if (!dialog.hidden && event.key === "Escape") close();
  });
})();
