async function __dev_mount_css__(id, data, file = false) {
  const tagId = `style_${id}`;
  let styleElement = document.getElementById(tagId);

  if (styleElement) {
  } else {
    styleElement = document.createElement("style");
    styleElement.id = tagId;
    document.head.appendChild(styleElement);
  }

  if (file) {
    const css = await fetch(`/${data}`).then((r) => r.text());
    styleElement.innerHTML = css;
  } else {
    styleElement.innerHTML = data;
  }
}
