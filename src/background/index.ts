import browser from 'webextension-polyfill';

browser.action.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL('src/app/index.html') });
});
