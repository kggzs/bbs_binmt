// ==UserScript==
// @name         论坛帖子路径与隐藏内容提示
// @namespace    http://www.kggzs.cn/
// @version      1.0.0
// @description  在论坛页面左下角显示当前帖子的路径信息（面包屑导航）和是否有隐藏内容。高亮特定板块（如"休闲灌水"）和隐藏状态。路径与状态分行显示，字体稍大。自动处理不同格式的帖子链接，并在页面加载完成后检测隐藏内容，优化以避免触发CC防护。
// @author       康哥 QQ:1724464998 Manus
// @match        https://bbs.binmt.cc/thread-*-*-*.html
// @match        https://bbs.binmt.cc/forum.php?mod=viewthread&tid=*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @icon         https://bbs.binmt.cc/favicon.ico
// ==/UserScript==

(function() {
    'use strict';

    window.addEventListener('load', function() {
        setTimeout(initScript, 500);
    });

    function initScript() {
        const targetUrlForScript = getTargetBreadcrumbUrl();
        if (targetUrlForScript) {
            displayInfo(null, "检测中...");
            fetchBreadcrumbAndInitiateChecks(targetUrlForScript);
        }
    }

    function getTargetBreadcrumbUrl() {
        const currentUrl = window.location.href;
        let targetUrl = null;
        const threadMatch = currentUrl.match(/https:\/\/bbs\.binmt\.cc\/thread-(\d+)-(\d+)-(\d+)\.html/);
        if (threadMatch) {
            const tid = threadMatch[1];
            targetUrl = `https://bbs.binmt.cc/thread-${tid}-1-1.html`;
        } else {
            const forumMatch = currentUrl.match(/https:\/\/bbs\.binmt\.cc\/forum\.php\?(?:[^&]*&)*tid=(\d+)/);
            if (forumMatch) {
                const tid = forumMatch[1];
                targetUrl = `https://bbs.binmt.cc/thread-${tid}-1-1.html`;
            }
        }
        return targetUrl;
    }

    function displayInfo(breadcrumbText, hideStatusText) {
        const existingDisplay = document.getElementById("manus-breadcrumb-display");
        if (existingDisplay) {
            existingDisplay.remove();
        }
        const displayDiv = document.createElement("div");
        displayDiv.id = "manus-breadcrumb-display";

        let finalBreadcrumbHtml = breadcrumbText || "路径信息加载中...";
        if (finalBreadcrumbHtml.includes("休闲灌水")) {
            finalBreadcrumbHtml = finalBreadcrumbHtml.replace(/休闲灌水/g,
                '<span style="color: red; font-weight: bold;">休闲灌水</span>');
        }

        let finalHideStatusHtml = "";
        if (hideStatusText) {
            if (hideStatusText.includes("有隐藏内容")) {
                finalHideStatusHtml = hideStatusText.replace(/有隐藏内容/g,
                    '<span style="color: red; font-weight: bold;">有隐藏内容</span>');
            } else {
                finalHideStatusHtml = hideStatusText;
            }
        }

        // Path and status on separate lines
        displayDiv.innerHTML = `<div>${finalBreadcrumbHtml}</div>`;
        if (finalHideStatusHtml) {
            displayDiv.innerHTML += `<div>${finalHideStatusHtml}</div>`;
        }

        document.body.appendChild(displayDiv);

        GM_addStyle(`
            #manus-breadcrumb-display {
                position: fixed; bottom: 15px; left: 15px;
                background-color: #f9f9f9; padding: 10px 15px;
                border: 1px solid #ddd; border-radius: 5px;
                box-shadow: 0px 2px 8px rgba(0,0,0,0.15);
                font-size: 14px; /* Increased font size */
                color: #333; z-index: 10000;
                max-width: 800px;
                opacity: 0.95; transition: opacity 0.3s ease-in-out;
            }
            #manus-breadcrumb-display:hover { opacity: 1; }
            #manus-breadcrumb-display div { margin-bottom: 3px; } /* Add some space between lines */
            #manus-breadcrumb-display div:last-child { margin-bottom: 0; }
            #manus-breadcrumb-display span[style*="color: red"] { font-weight: bold; }
        `);
    }

    function findEditLinkForMainPost(doc, baseThreadUrl) {
        let editLinkElement = null;
        const firstPostContainer = doc.querySelector('div[id^="post_"]');
        if (firstPostContainer) {
            editLinkElement = firstPostContainer.querySelector('div.pob.cl a.editp, div.pob.cl em a.editp');
        }
        if (!editLinkElement) {
            editLinkElement = doc.querySelector('a.editp');
            if (editLinkElement) {
                 console.log("[油猴脚本] 注意: 使用了通用的 a.editp 选择器查找编辑链接。");
            }
        }
        if (editLinkElement) {
            let href = editLinkElement.getAttribute('href');
            if (href) {
                try {
                    return new URL(href, baseThreadUrl).href;
                } catch (e) {
                    console.warn("[油猴脚本] 无法解析编辑链接URL:", href, e);
                    return null;
                }
            }
        }
        console.warn("[油猴脚本] 未能在页面上找到主楼的编辑链接。");
        return null;
    }

    function checkContentForHide(content) {
        if (typeof content === 'string') {
            return /\[hide\]/i.test(content) && /\[\/hide\]/i.test(content);
        }
        return false;
    }

    function fetchEditPageAndCheckHide(editUrl, breadcrumbText, preliminaryHideFoundOnThreadPage) {
        GM_xmlhttpRequest({
            method: "GET",
            url: editUrl,
            onload: function(response) {
                let hasHideInEditPage = false;
                let hideStatusSource = "";
                if (response.status >= 200 && response.status < 300) {
                    const parser = new DOMParser();
                    const editDoc = parser.parseFromString(response.responseText, "text/html");
                    let contentToCheck = "";

                    const mainTextarea = editDoc.querySelector('textarea#posteditor_textarea, textarea#e_textarea, textarea[name="message"]');
                    if (mainTextarea && typeof mainTextarea.value === 'string') {
                        contentToCheck = mainTextarea.value;
                        hideStatusSource = " (编辑区textarea)";
                    } else {
                        const divArea = editDoc.querySelector('div.area');
                        if (divArea) {
                            const nestedTextarea = divArea.querySelector('textarea');
                            if (nestedTextarea && typeof nestedTextarea.value === 'string') {
                                contentToCheck = nestedTextarea.value;
                                hideStatusSource = " (编辑区div.area > textarea)";
                            } else {
                                contentToCheck = divArea.innerHTML;
                                hideStatusSource = " (编辑区div.area HTML)";
                            }
                        }
                    }

                    if (!contentToCheck) {
                        const iframe = editDoc.querySelector('iframe#e_iframe.pt');
                        if (iframe) {
                            if (iframe.srcdoc && typeof iframe.srcdoc === 'string') {
                                const iframeParser = new DOMParser();
                                const iframeDoc = iframeParser.parseFromString(iframe.srcdoc, "text/html");
                                contentToCheck = iframeDoc.body.innerHTML;
                                hideStatusSource = " (编辑区iframe srcdoc)";
                            } else {
                                console.warn("[油猴脚本] 编辑页iframe存在但无srcdoc或无法直接检查其内容。src:", iframe.src);
                            }
                        }
                    }

                    console.log("[油猴脚本] 待检查的编辑区内容片段 (前200字符):", contentToCheck.substring(0, 200) + "...");

                    if (checkContentForHide(contentToCheck)) {
                        hasHideInEditPage = true;
                    }

                    if (hasHideInEditPage) {
                        displayInfo(breadcrumbText, `有隐藏内容${hideStatusSource}`);
                    } else if (preliminaryHideFoundOnThreadPage) {
                         displayInfo(breadcrumbText, "有隐藏内容 (页面检测) / 编辑区未检测到");
                    } else {
                        displayInfo(breadcrumbText, "无隐藏内容 (编辑区未检测到)");
                    }

                } else {
                    console.error(`[油猴脚本] 请求编辑页面 ${editUrl} 失败: `, response.status, response.statusText);
                    displayInfo(breadcrumbText, preliminaryHideFoundOnThreadPage ? "有隐藏内容 (页面检测) / 编辑页请求失败" : "隐藏状态未知 (编辑页请求失败)");
                }
            },
            onerror: function(error) {
                console.error(`[油猴脚本] 请求编辑页面 ${editUrl} 发生错误: `, error);
                displayInfo(breadcrumbText, preliminaryHideFoundOnThreadPage ? "有隐藏内容 (页面检测) / 编辑页请求错误" : "隐藏状态未知 (编辑页请求错误)");
            }
        });
    }

    function fetchBreadcrumbAndInitiateChecks(breadcrumbUrl) {
        GM_xmlhttpRequest({
            method: "GET",
            url: breadcrumbUrl,
            onload: function(response) {
                let breadcrumbText = "路径信息获取失败";
                let preliminaryHideFoundOnThreadPage = false;
                let editUrl = null;

                if (response.status >= 200 && response.status < 300) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(response.responseText, "text/html");
                    const ptDiv = doc.querySelector("div#pt.bm.cl > div.z");
                    if (ptDiv) {
                        let parts = [];
                        const links = ptDiv.querySelectorAll("a");
                        links.forEach(link => {
                            let text = link.textContent.trim();
                            // Filter out specified texts
                            if (text !== "MT论坛" && text !== "论坛" && text !== "交流与讨论") {
                                parts.push(text);
                            }
                        });
                        breadcrumbText = parts.join(" › ");
                    } else {
                         console.warn(`[油猴脚本] 在URL: ${breadcrumbUrl} 未能找到指定的面包屑导航元素.`);
                    }

                    if (doc.querySelector("div.showhide")) {
                        preliminaryHideFoundOnThreadPage = true;
                        displayInfo(breadcrumbText, "有隐藏内容 (页面检测)");
                        return;
                    }

                    editUrl = findEditLinkForMainPost(doc, breadcrumbUrl);
                } else {
                    console.error(`[油猴脚本] 请求面包屑/主帖页面 ${breadcrumbUrl} 失败: `, response.status, response.statusText);
                    displayInfo(breadcrumbText, "隐藏状态未知 (主帖页面请求失败)");
                    return;
                }

                if (editUrl) {
                    fetchEditPageAndCheckHide(editUrl, breadcrumbText, preliminaryHideFoundOnThreadPage);
                } else {
                    displayInfo(breadcrumbText, "无隐藏内容 (编辑链接未找到)");
                }
            },
            onerror: function(error) {
                console.error(`[油猴脚本] 请求面包屑/主帖页面 ${breadcrumbUrl} 发生错误: `, error);
                displayInfo("路径信息获取失败", "隐藏状态未知 (主帖页面请求错误)");
            }
        });
    }
})();
