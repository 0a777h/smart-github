chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (msg.name === "issue-tab-loaded" || msg.name === "issue-contents-page-loaded") {
        const oldIssueBtn = document.querySelector('a.btn[href$="/issues/new"]');
        // onUpdated 이벤트가 페이지가 이동하기 전에 발생하여 생기는 TypeError 임시 방어 처리
        if (!oldIssueBtn) {
            return;
        }

        const btnParent = oldIssueBtn.parentNode;
        const newIssueUrl = oldIssueBtn.getAttribute("href");
        const advancedIssueBtn = _createNewIssueBtn(newIssueUrl);

        if (msg.name === "issue-contents-page-loaded") {
            _convertToSmallBtn(advancedIssueBtn);
        }

        const dropdownWrapper = _createDropdownWrapper();
        dropdownWrapper.classList.add("float-right");
        const dropdown = _createDropdown();
        dropdown.classList.add("sg-bottom-right");
        const loadingMsg = _createLoadingMsg();

        dropdown.appendChild(loadingMsg);
        dropdownWrapper.append(advancedIssueBtn, dropdown);

        oldIssueBtn.remove();
        btnParent.appendChild(dropdownWrapper);

        _fetchIssueTemplateData().then(data => {
            data.newIssueUrl = newIssueUrl;

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
        const templateLabelKey = `templateLabel(${location.host})`;

        submitBtn.addEventListener("click", () => {
            const templateName = location.search.match(/template=(.*?)\.md/i)[1];
            const labels = document.getElementsByClassName('labels')[0].children;
          
            const currentLabels = [];
            for (const label of labels) {
                currentLabels.push(label.innerText);
            }
        
            chrome.storage.sync.get(templateLabelKey, result => {
                chrome.storage.sync.set({
                    [templateLabelKey]: {
                        ...result[templateLabelKey],
                        [templateName]: currentLabels
                    }
                });
            });
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

function _createNewIssueBtn(href = "#") {
    const newIssueBtn = document.createElement("a");
    newIssueBtn.classList.add("sg-dropdown-btn");
    newIssueBtn.href = href;
    newIssueBtn.innerHTML = "New issue";

    return newIssueBtn;
}

function _createDropdown() {
    const dropdown = document.createElement("div");
    dropdown.classList.add("sg-dropdown");

    return dropdown;
}

function _createLoadingMsg() {
    const loadingMsg = document.createElement("a");
    loadingMsg.href = "#";
    loadingMsg.innerHTML = "Loading...";

    return loadingMsg;
}

async function _fetchIssueTemplateData() {
    const {host, username, reponame} = _getApiInfo();

    // https://developer.github.com/v3/repos/contents/
    const url = `${host}/repos/${username}/${reponame}/contents/.github/ISSUE_TEMPLATE`;
    const token = await _fetchToken();
    const response = await _fetch({url, token});

    const data = await _createTemplateData(response);
    data.issueData = true;

    return data;
}

async function _fetchPRTemplateData() {
    const {host, username, reponame} = _getApiInfo();

    // https://developer.github.com/v3/repos/contents/
    const url = `${host}/repos/${username}/${reponame}/contents/.github/PULL_REQUEST_TEMPLATE`;
    const token = await _fetchToken();
    const response = await _fetch({url, token});

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
        templateData.labels = await _getTemplateLabels();
    } else {
        templateData.contents = _getContentsOnError(response.status);
    }

    return templateData;
}

function _getTemplateLabels() {
    return new Promise((resolve, reject) => {
        const templateLabelKey = `templateLabel(${location.host})`;
        chrome.storage.sync.get([templateLabelKey], result => {
            resolve(result[templateLabelKey]);
        });
    });
}

function _getApiInfo() {
    const host = location.protocol + "//" +
        (location.host === "github.com" ? "api.github.com" : (location.host + "/api/v3"));

    const match = location.pathname.match(/([^\/]+)\/([^\/]+)/);
    const username = match[1];
    const reponame = match[2];

    return {
        host,
        username,
        reponame
    };
}

function _fetchToken() {
    return new Promise((resolve, reject) => {
        const tokenKey = `sg-token(${location.host})`;
        chrome.storage.sync.get(tokenKey, result => {
            const token = result[tokenKey];

            resolve(token);
        });
    });
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
            return `현재 사용하시는 토큰이 유효하지 않습니다. ` +
                `<a class="sg-new-token" href="${_getTokenListUrl()}" target="_blank">이 링크</a>를 ` +
                `통해서 이전 <strong>SmartGithub</strong> 토큰을 지운 후 ` +
                `<a class="sg-new-token" href="${_getNewTokenUrl()}" target="_blank">여기서 다시 생성</a> ` +
                `해주세요! 그리고, 아래에 붙여 넣어주세요. ` +
                `<input id="sg-token" type="text" placeholder="이 곳에 토큰을 넣어주세요" autocomplete="off">`;
        case 404:
            return `.github/ISSUE_TEMPLATE 디렉토리가 존재하지 않거나, 비공개 저장소에서 사용할 토큰이 없습니다. ` +
                `<a class="sg-new-token" href="${_getNewTokenUrl()}" target="_blank">이 링크</a>를 ` +
                `통해서 생성하고, 아래에 붙여 넣어주세요. ` +
                `<input id="sg-token" type="text" placeholder="이 곳에 토큰을 넣어주세요" autocomplete="off">`;
        default:
            return "Unknown error occurs.";
    }
}

function _getTokenListUrl() {
    return `${location.protocol}//${location.host}/settings/tokens`;
}

function _getNewTokenUrl() {
    return `${location.protocol}//${location.host}/settings/tokens/new?` +
        `scopes=repo&description=SmartGithub(${location.host})`;
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
            const href = labels[tempName] ?
                `${newIssueUrl}?template=${tempName}.md&labels=${labels[tempName].join(',')}`
                : `${newIssueUrl}?template=${tempName}.md`;
            const href = `${newIssueUrl}?template=${tempName}.md&labels=${tempName}`;
            const item = `<a href=${href}>${tempName}</span>`;

            dropdownContents.innerHTML += item;
        }
    } else {
        for (const tempName of templateNames) {
            const href = `?quick_pull=1&template=${tempName}.md&labels=${tempName}`;
            const item = `<a href=${href}>${tempName}</span>`;

            dropdownContents.innerHTML += item;
        }
    }

    return dropdownContents;
}

function _createSaveTokenBtn() {
    const savebtn = document.createElement("button");
    savebtn.addEventListener("click", _saveToken);
    savebtn.innerHTML = "저장";

    return savebtn;
}

function _saveToken() {
    const tokenKey = `sg-token(${location.host})`;
    const token = document.getElementById("sg-token").value;
    chrome.storage.sync.set({[tokenKey]: token}, () => {
        alert("토큰이 성공적으로 저장되었습니다.");
        location.reload();
    });
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
    resetBtn.innerHTML = "Reset to template";
    resetBtn.addEventListener("click", _resetIssueBody);

    return resetBtn;
}

function _resetIssueBody() {
    if (!window.confirm("정말 리셋하시겠습니까?")) {
        return;
    }

    const templateName = location.search.match(/template=(.*?)\.md/i)[1];
    _fetchIssueTemplateFileInfo(templateName).then(result => {
        const issueBody = document.getElementById("issue_body");
        // base64 decoding
        const content = _b64DecodeUnicode(result.contents.content);

        issueBody.value = content;
    });
}

async function _fetchIssueTemplateFileInfo(name) {
    const {host, username, reponame} = _getApiInfo();
    // https://developer.github.com/v3/repos/contents/#get-contents
    const url = `${host}/repos/${username}/${reponame}/contents/.github/ISSUE_TEMPLATE/${name}.md`;
    const token = await _fetchToken();
    const response = await _fetch({url, token});

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

function _fetch({url, token}) {
    const requestInit = {};
    if (token) {
        requestInit.headers = {
            Authorization: `token ${token}`
        };
    }

    return new Promise((resolve, reject) => {
        fetch(url, requestInit)
            .then(resolve)
            .catch(reject);
    });
}
