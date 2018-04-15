import "./content.css";
import {storage, fetcher, urlManager} from "./utils";

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.name === "issue-tab-loaded" || msg.name === "issue-contents-page-loaded") {
        const newIssueBtn = document.querySelector('a.btn[href$="/issues/new"]');
        // onUpdated 이벤트가 페이지가 이동하기 전에 발생하여 생기는 TypeError 임시 방어 처리
        if (!newIssueBtn) {
            return;
        }

        newIssueBtn.classList.add("sg-dropdown-btn");
        const btnParent = newIssueBtn.parentNode;

        // 뒤로 가기 할 경우 태그가 추가 생성되므로, 이미 생성된 경우 방어 처리
        if (btnParent.classList.contains("sg-dropdown-wrapper")) {
            return;
        }

        if (msg.name === "issue-contents-page-loaded") {
            _convertToSmallBtn(newIssueBtn);
        }

        const dropdownWrapper = _createDropdownWrapper();
        dropdownWrapper.classList.add("float-right");
        const dropdown = _createDropdown();
        dropdown.classList.add("sg-bottom-right");
        const loadingMsg = _createLoadingMsg();

        dropdown.appendChild(loadingMsg);
        dropdownWrapper.append(newIssueBtn, dropdown);

        btnParent.appendChild(dropdownWrapper);

        _fetchIssueTemplateData().then(data => {
            data.newIssueUrl = newIssueBtn.getAttribute("href");

            const dropdownContents = _createDropdownContents(data);
            dropdown.replaceChild(dropdownContents, loadingMsg);
        });
    } else if (msg.name === "pr-tab-loaded") {
    } else if (msg.name === "new-issue-page-loaded") {
        const bottomArea = document.getElementsByClassName("form-actions")[0];
        // onUpdated 이벤트가 페이지가 이동하기 전에 발생하여 생기는 TypeError 임시 방어 처리
        if (!bottomArea) {
            return;
        }

        // [#28] 방어 처리
        const oldResetBtn = bottomArea.getElementsByClassName("sg-reset-btn");
        while (oldResetBtn.length > 0) {
            oldResetBtn[0].remove();
        }

        const resetBtn = _createResetTemplateBtn();
        bottomArea.appendChild(resetBtn);

        const submitBtn = bottomArea.getElementsByClassName("btn-primary")[0];

        submitBtn.addEventListener("click", () => {
            const templateName = urlManager.getCurrentTemplate();
            const labelContainer = document.querySelector(".labels").children;
            const labels = [].map.call(labelContainer, label => label.innerHTML);
        
            storage.setTemplateNameToLabelsMap({[templateName]: labels});
        });
    } else if (msg.name === "new-pr-page-loaded") {
        const comparePlaceholder = document.querySelector(".compare-pr-placeholder");
        const createPrBtn = comparePlaceholder.getElementsByTagName("button")[0];

        const dropdownWrapper = _createDropdownWrapper();
        dropdownWrapper.classList.add("float-left");
        const dropdown = _createDropdown();
        dropdown.classList.add("sg-bottom-left");
        const loadingMsg = _createLoadingMsg();

        dropdown.appendChild(loadingMsg);
        dropdownWrapper.append(createPrBtn, dropdown);

        comparePlaceholder.prepend(dropdownWrapper);

        _fetchPRTemplateData().then(data => {
            const dropdownContents = _createDropdownContents(data);
            dropdown.replaceChild(dropdownContents, loadingMsg);
        });
    }
});

function _createDropdownWrapper() {
    const dropdownWrapper = document.createElement("div");
    dropdownWrapper.classList.add("sg-dropdown-wrapper");

    return dropdownWrapper;
}

function _createDropdown() {
    const dropdown = document.createElement("div");
    dropdown.classList.add("sg-dropdown");

    return dropdown;
}

function _createLoadingMsg() {
    const loadingMsg = document.createElement("a");
    loadingMsg.href = "#";
    loadingMsg.innerHTML = chrome.i18n.getMessage("loading");

    return loadingMsg;
}

async function _fetchIssueTemplateData() {
    const url = urlManager.getIssueTemplateApiUrl();
    const token = await storage.getToken();
    const response = await fetcher.fetch({url, token});

    const data = await _createTemplateData(response);
    data.issueData = true;

    return data;
}

async function _fetchPRTemplateData() {
    const url = urlManager.getPrTemplateApiUrl();
    const token = await storage.getToken();
    const response = await storage.fetch({url, token});

    const data = await _createTemplateData(response);
    data.issueData = false;

    return data;
}

async function _createTemplateData(response) {
    let templateData = {
        ok: response.ok,
        status: response.status
    };

    // TODO: 어떨 땐 JSON 어떨 땐 DOM? 일관성 필요함
    if (response.ok) {
        templateData.contents = await _convertReadableStreamToJson(response);
        templateData.labels = await storage.getTemplateNameToLabelsMap();
    } else {
        templateData.contents = _getContentsOnError(response.status);
    }

    return templateData;
}

async function _convertReadableStreamToJson(res) {
    let jsonData;
    await res.json().then(data => {jsonData = data});

    return jsonData;
}

// TODO: refactor to HTML
function _getContentsOnError(status) {
    switch (status) {
        case 401:
            return `${chrome.i18n.getMessage("401error_1")}<br>` +
                `1. <a class="sg-new-token" href="${urlManager.getTokenListPageUrl()}" target="_blank">` +
                `${chrome.i18n.getMessage("401error_2")}</a><br>` +
                `2. <a class="sg-new-token" href="${urlManager.getNewTokenPageUrl()}" target="_blank">` +
                `${chrome.i18n.getMessage("401error_3")}</a><br>` +
                `3. ${chrome.i18n.getMessage("401error_4")}<br>` +
                `<input id="sg-token" type="text"` +
                `placeholder="${chrome.i18n.getMessage("tokenPlaceholder")}" autocomplete="off">`;
        case 404:
            return `${chrome.i18n.getMessage("404error_1")}<br>` +
                `1. <a class="sg-new-token" href="${urlManager.getNewTokenPageUrl()}" target="_blank">` +
                `${chrome.i18n.getMessage("404error_2")}</a><br>` +
                `2. ${chrome.i18n.getMessage("404error_3")}<br>` +
                `<input id="sg-token" type="text"` + 
                `placeholder="${chrome.i18n.getMessage("tokenPlaceholder")}" autocomplete="off">`;
        default:
            return chrome.i18n.getMessage("unknownError");
    }
}

function _createDropdownContents(data) {
    const dropdownContents = document.createElement("div");
    dropdownContents.classList.add("sg-dropdown-contents");

    if (!data.ok) {
        // event bind 문제로 저장 버튼은 따로 삽입함
        const savebtn = _createSaveTokenBtn();
        dropdownContents.innerHTML = data.contents;
        dropdownContents.appendChild(savebtn);

        return dropdownContents;
    }

    const {contents, newIssueUrl, labels} = data;
    const templateNames = _extractTemplateNames(contents);

    if (data.issueData) {
        for (const tempName of templateNames) {
            let href = `${newIssueUrl}?template=${tempName}.md`;

            if (labels[tempName]) {
                const encodedLabels = encodeURIComponent(labels[tempName].join(","));
                href = `${newIssueUrl}?template=${tempName}.md&labels=${encodedLabels}`;
            }

            const item = `<a href=${href}>${tempName}</a>`;

            dropdownContents.innerHTML += item;
        }
    } else {
        for (const tempName of templateNames) {
            const href = `?quick_pull=1&template=${tempName}.md&labels=${tempName}`;
            const item = `<a href=${href}>${tempName}</a>`;

            dropdownContents.innerHTML += item;
        }
    }

    return dropdownContents;
}

function _createSaveTokenBtn() {
    const savebtn = document.createElement("button");
    savebtn.addEventListener("click", storage.setToken.bind(storage));
    savebtn.innerHTML = chrome.i18n.getMessage("save");

    return savebtn;
}

function _extractTemplateNames(contents) {
    let names = [];

    for (const content of contents) {
        const match = content.name.match(/(.*).md$/i);
        match && names.push(match[1]);
    }

    return names;
}

function _createResetTemplateBtn() {
    const resetBtn = document.createElement("a");
    resetBtn.classList.add("btn", "sg-reset-btn");
    resetBtn.innerHTML = chrome.i18n.getMessage("resetToTemplate");
    resetBtn.addEventListener("click", _resetIssueBody);

    return resetBtn;
}

function _resetIssueBody() {
    if (!window.confirm(chrome.i18n.getMessage("confirmReset"))) {
        return;
    }

    const templateName = urlManager.getCurrentTemplate();
    _fetchIssueTemplateFileInfo(templateName).then(result => {
        const issueBody = document.getElementById("issue_body");
        // base64 decoding
        const content = _b64DecodeUnicode(result.contents.content);

        issueBody.value = content;
    });
}

async function _fetchIssueTemplateFileInfo(name) {
    const url = urlManager.getFileInfoApiUrl(name);
    const token = await storage.getToken();
    const response = await fetcher.fetch({url, token});

    return await _createTemplateData(response);
}

/**
 * github API에서 base64로 인코딩된 문자열을 내려주는데,
 * 단순히 atob() 메서드로는 해결되지 않아 아래의 답변을 이용하였음
 * https://stackoverflow.com/a/30106551/5247212
 */
function _b64DecodeUnicode(str) {
    return decodeURIComponent(Array.prototype.map.call(atob(str), function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function _convertToSmallBtn(largeBtn) {
    largeBtn.classList.add("sg-small-btn");
}