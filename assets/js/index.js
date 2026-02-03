let sidebarOpened = false;

const toggleSidebar = () => {
  sidebarOpened = !sidebarOpened;
  updateSidebar();
}

const closePopup = (event) => {
  if (event.target !== event.currentTarget) {
    return;
  }

  const closeEls = document.getElementsByClassName("popup-close");
  if (closeEls.length > 0) {
    closeEls[0].click();
  }

}

const updateSidebar = () => {
  const sidebarEl = document.getElementById("sidebar");
  sidebarEl.classList = sidebarOpened
    ? "mobile-opened"
    : "";

  const popupOverlayEl = document.getElementById("popup-overlay");
  popupOverlayEl.classList = sidebarOpened
    ? "mobile-opened"
    : "";
}