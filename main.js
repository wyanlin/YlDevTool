function normalizeHex(input) {
    return input
        .replace(/0x/gi, " ")
        .replace(/[^0-9a-fA-F]/g, "")
        .trim();
}

function hexToAscii(hexString) {
    const normalized = normalizeHex(hexString);

    if (normalized.length === 0) {
        return "";
    }

    if (normalized.length % 2 !== 0) {
        throw new Error("十六进制字符数量必须为偶数。");
    }

    if (!/^[0-9a-fA-F]+$/.test(normalized)) {
        throw new Error("包含非法十六进制字符。");
    }

    const bytes = normalized.match(/.{2}/g) ?? [];
    const chars = bytes.map((byte) => String.fromCharCode(parseInt(byte, 16)));
    return chars.join("");
}

function asciiToHex(text) {
    if (!text) {
        return "";
    }

    let result = "";

    for (const ch of text) {
        const hex = ch.charCodeAt(0).toString(16).padStart(2, "0");
        result += hex;
    }

    return result;
}

const INFO_TYPE_MAP = {
    0x07: "AT命令",
    0x0f: "短信",
    0x13: "语音",
    0x17: "数据",
    0x1f: "AQ指令",
};

function hexStringToBytes(hex) {
    if (!hex) {
        return [];
    }

    if (hex.length % 2 !== 0) {
        throw new Error("十六进制字符数量必须为偶数。");
    }

    const bytes = [];
    for (let i = 0; i < hex.length; i += 2) {
        bytes.push(parseInt(hex.slice(i, i + 2), 16));
    }
    return bytes;
}

function bytesToHex(bytes) {
    return bytes.map((byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
}

function formatByte(value) {
    return `0x${value.toString(16).padStart(2, "0").toUpperCase()}`;
}

function bytesToAsciiPreview(bytes) {
    if (bytes.length === 0) {
        return "";
    }

    return bytes
        .map((byte) => {
            if (byte >= 32 && byte <= 126) {
                if (byte === 0x5c) {
                    return "\\\\";
                }
                return String.fromCharCode(byte);
            }

            switch (byte) {
                case 0x00:
                    return "\\0";
                case 0x07:
                    return "\\a";
                case 0x08:
                    return "\\b";
                case 0x09:
                    return "\\t";
                case 0x0a:
                    return "\\n";
                case 0x0b:
                    return "\\v";
                case 0x0c:
                    return "\\f";
                case 0x0d:
                    return "\\r";
                default:
                    return `\\x${byte.toString(16).padStart(2, "0").toUpperCase()}`;
            }
        })
        .join("");
}

function parseByteInput(raw, label) {
    const value = raw.trim();
    if (!value) {
        throw new Error(`${label} 不能为空。`);
    }

    let normalized = value;
    if (/^0x/i.test(normalized)) {
        normalized = normalized.replace(/^0x/i, "");
    }

    let parsed;
    if (/^[0-9a-fA-F]{1,2}$/.test(normalized)) {
        parsed = parseInt(normalized, 16);
    } else if (/^\d+$/.test(normalized)) {
        parsed = parseInt(normalized, 10);
    } else {
        throw new Error(`${label} 格式不正确，请输入十六进制或十进制。`);
    }

    if (Number.isNaN(parsed) || parsed < 0 || parsed > 0xff) {
        throw new Error(`${label} 超出 0-255 范围。`);
    }

    return parsed;
}

function parseStartMarker(raw) {
    const normalized = normalizeHex(raw);
    if (normalized.length === 0) {
        return "EB90";
    }

    if (normalized.length !== 4) {
        throw new Error("起始标识必须为 2 字节（4 个十六进制字符）。");
    }

    return normalized.toUpperCase();
}

function decodeProtocolFrame(frameHex) {
    const normalized = normalizeHex(frameHex);
    if (!normalized) {
        throw new Error("请输入协议帧数据。");
    }

    const bytes = hexStringToBytes(normalized);
    if (bytes.length < 6) {
        throw new Error("数据长度不足，无法解析。");
    }

    const startMarker = bytesToHex(bytes.slice(0, 2));
    const infoType = bytes[2];
    const frameId = bytes[3];
    const length = (bytes[4] << 8) | bytes[5];
    const payloadBytes = bytes.slice(6);

    if (payloadBytes.length < length) {
        throw new Error(`长度字段指示 ${length} 字节，但实际仅有 ${payloadBytes.length} 字节。`);
    }

    const contentBytes = payloadBytes.slice(0, length);
    const remainingBytes = payloadBytes.slice(length);

    return {
        startMarker,
        infoType,
        infoTypeDesc: INFO_TYPE_MAP[infoType] ?? "",
        frameId,
        length,
        payloadHex: bytesToHex(contentBytes),
        payloadAscii: bytesToAsciiPreview(contentBytes),
        totalBytes: bytes.length,
        remainingHex: remainingBytes.length ? bytesToHex(remainingBytes) : "",
    };
}

function encodeProtocolFrame({ startMarker, infoType, frameId, payload, format = "hex", prefixSuffix = "none" }) {
    const markerHex = parseStartMarker(startMarker);
    const markerBytes = hexStringToBytes(markerHex);
    const infoTypeByte = parseByteInput(infoType, "信息类型");
    const frameIdByte = parseByteInput(frameId, "帧计数");

    // 处理payload内容
    let payloadBytes = [];
    if (payload) {
        if (format === "ascii") {
            // ASCII格式：转换为十六进制字节
            const asciiText = payload;
            payloadBytes = Array.from(asciiText, char => char.charCodeAt(0));
        } else {
            // 十六进制格式
            const payloadNormalized = normalizeHex(payload);
            if (payloadNormalized.length % 2 !== 0) {
                throw new Error("信息内容十六进制字符数量必须为偶数。");
            }
            payloadBytes = hexStringToBytes(payloadNormalized);
        }

        // 添加前缀/后缀
        let prefixBytes = [];
        let suffixBytes = [];

        switch (prefixSuffix) {
            case "prefix_cr":
                prefixBytes = [0x0D]; // \r 前缀
                break;
            case "suffix_cr":
                suffixBytes = [0x0D]; // \r 后缀
                break;
            case "prefix_crlf":
                prefixBytes = [0x0D, 0x0A]; // \r\n 前缀
                break;
            case "suffix_crlf":
                suffixBytes = [0x0D, 0x0A]; // \r\n 后缀
                break;
            case "none":
            default:
                // 不添加前缀/后缀
                break;
        }

        payloadBytes = [...prefixBytes, ...payloadBytes, ...suffixBytes];
    }

    const length = payloadBytes.length;

    if (length > 0xffff) {
        throw new Error("信息内容过长，长度字段仅支持 0xFFFF。");
    }

    const lengthBytes = [(length >> 8) & 0xff, length & 0xff];
    const frameBytes = [
        ...markerBytes,
        infoTypeByte,
        frameIdByte,
        ...lengthBytes,
        ...payloadBytes,
    ];

    return {
        hex: bytesToHex(frameBytes),
        byteLength: frameBytes.length,
    };
}

function renderProtocolDecode(result) {
    const container = document.getElementById("protocolDecodeResult");
    if (!container) {
        return;
    }

    if (!result) {
        container.innerHTML = "";
        return;
    }

    const infoTypeLine = result.infoTypeDesc
        ? `${formatByte(result.infoType)} (${result.infoTypeDesc})`
        : `${formatByte(result.infoType)} (未知类型)`;

    const payloadAscii = result.payloadAscii
        ? result.payloadAscii
        : "(不可打印字符)";

    container.innerHTML = `
        <dl class="protocol-list">
            <dt>起始标识</dt>
            <dd>${result.startMarker}</dd>
            <dt>信息类型</dt>
            <dd>${infoTypeLine}</dd>
            <dt>帧计数</dt>
            <dd>${formatByte(result.frameId)}</dd>
            <dt>长度</dt>
            <dd>${result.length} 字节</dd>
            <dt>信息内容 (Hex)</dt>
            <dd>${result.payloadHex || "(空)"}</dd>
            <dt>信息内容 (ASCII 预览)</dt>
            <dd>${result.payloadHex ? payloadAscii : "(空)"}</dd>
            <dt>帧总字节数</dt>
            <dd>${result.totalBytes}</dd>
            ${result.remainingHex ? `<dt>剩余数据</dt><dd>${result.remainingHex}</dd>` : ""}
        </dl>
    `;
}

function setResult(value) {
    const resultBox = document.getElementById("result");
    resultBox.value = value;
}

function setStatus(message, type = "info", targetId = "status") {
    const status = document.getElementById(targetId);
    if (!status) {
        return;
    }
    status.textContent = message;
    status.dataset.type = type;
}

function attachHandlers() {
    const hexInput = document.getElementById("hexInput");
    const asciiInput = document.getElementById("asciiInput");
    const hexBtn = document.getElementById("hexToAsciiBtn");
    const asciiBtn = document.getElementById("asciiToHexBtn");
    const copyBtn = document.getElementById("copyResultBtn");
    const clearButtons = document.querySelectorAll(".clear-btn");

    hexBtn.addEventListener("click", () => {
        try {
            const ascii = hexToAscii(hexInput.value);
            setResult(ascii);
            asciiInput.value = ascii;
            setStatus("转换成功：十六进制 → ASCII", "success");
        } catch (error) {
            setResult("");
            setStatus(error.message, "error");
        }
    });

    asciiBtn.addEventListener("click", () => {
        try {
            const hex = asciiToHex(asciiInput.value);
            setResult(hex);
            hexInput.value = hex;
            setStatus("转换成功：ASCII → 十六进制", "success");
        } catch (error) {
            setResult("");
            setStatus(error.message, "error");
        }
    });

    copyBtn.addEventListener("click", async () => {
        const result = document.getElementById("result").value;
        if (!result) {
            setStatus("没有可复制的内容。", "info");
            return;
        }

        try {
            await navigator.clipboard.writeText(result);
            setStatus("结果已复制到剪贴板。", "success");
        } catch (error) {
            setStatus("浏览器未允许访问剪贴板。", "error");
        }
    });

    clearButtons.forEach((button) => {
        button.addEventListener("click", () => {
            const targetId = button.dataset.target;
            const target = document.getElementById(targetId);
            if (target) {
                target.value = "";
            }

            const statusTarget = button.dataset.status;
            if (statusTarget) {
                setStatus("", "info", statusTarget);
            } else {
                setStatus("");
            }
        });
    });

    [hexInput, asciiInput].forEach((input) => {
        input.addEventListener("input", () => setStatus(""));
    });

    attachProtocolTools();
    attachIpValidator();
    initToolMenu();
}

window.addEventListener("DOMContentLoaded", attachHandlers);

function attachProtocolTools() {
    const decodeBtn = document.getElementById("decodeProtocolBtn");
    const encodeBtn = document.getElementById("encodeProtocolBtn");
    if (!decodeBtn || !encodeBtn) {
        return;
    }

    const protocolHexInput = document.getElementById("protocolHexInput");
    const decodeStatusId = "protocolDecodeStatus";
    const encodeStatusId = "protocolEncodeStatus";
    const startMarkerInput = document.getElementById("startMarkerInput");
    const infoTypeInput = document.getElementById("infoTypeInput");
    const frameIdInput = document.getElementById("frameIdInput");
    const payloadInput = document.getElementById("payloadInput");
    const payloadFormat = document.getElementById("payloadFormat");
    const prefixSuffix = document.getElementById("prefixSuffix");
    const protocolEncodeResult = document.getElementById("protocolEncodeResult");
    const copyProtocolBtn = document.getElementById("copyProtocolBtn");

    decodeBtn.addEventListener("click", () => {
        try {
            const result = decodeProtocolFrame(protocolHexInput.value);
            renderProtocolDecode(result);
            setStatus("解包成功。", "success", decodeStatusId);
        } catch (error) {
            renderProtocolDecode(null);
            setStatus(error.message, "error", decodeStatusId);
        }
    });

    encodeBtn.addEventListener("click", () => {
        try {
            const { hex, byteLength } = encodeProtocolFrame({
                startMarker: startMarkerInput.value,
                infoType: infoTypeInput.value,
                frameId: frameIdInput.value,
                payload: payloadInput.value,
                format: payloadFormat.value,
                prefixSuffix: prefixSuffix.value,
            });
            protocolEncodeResult.value = hex;
            setStatus(`组包成功，共 ${byteLength} 字节。`, "success", encodeStatusId);
        } catch (error) {
            protocolEncodeResult.value = "";
            setStatus(error.message, "error", encodeStatusId);
        }
    });

    copyProtocolBtn.addEventListener("click", async () => {
        const frame = protocolEncodeResult.value;
        if (!frame) {
            setStatus("没有可复制的帧数据。", "info", encodeStatusId);
            return;
        }

        try {
            await navigator.clipboard.writeText(frame);
            setStatus("帧数据已复制到剪贴板。", "success", encodeStatusId);
        } catch (error) {
            setStatus("浏览器未允许访问剪贴板。", "error", encodeStatusId);
        }
    });

    [protocolHexInput, startMarkerInput, frameIdInput, payloadInput].forEach((input) => {
        input.addEventListener("input", () => {
            const target = input === protocolHexInput ? decodeStatusId : encodeStatusId;
            setStatus("", "info", target);
        });
    });

    // 为select元素添加change事件监听器
    [infoTypeInput, payloadFormat, prefixSuffix].forEach((select) => {
        select.addEventListener("change", () => {
            setStatus("", "info", encodeStatusId);
        });
    });
}

function initToolMenu() {
    const menuItems = document.querySelectorAll(".tool-menu-item");
    const views = document.querySelectorAll(".view");
    const title = document.getElementById("viewTitle");
    const subtitle = document.getElementById("viewSubtitle");

    if (!menuItems.length || !views.length || !title || !subtitle) {
        return;
    }

    const activateView = (target) => {
        views.forEach((view) => {
            const isActive = view.dataset.view === target;
            view.classList.toggle("is-hidden", !isActive);
            if (isActive) {
                title.textContent = view.dataset.title ?? title.textContent;
                subtitle.textContent = view.dataset.subtitle ?? subtitle.textContent;
            }
        });
        menuItems.forEach((item) => {
            item.classList.toggle("active", item.dataset.viewTarget === target);
        });
    };

    menuItems.forEach((item) => {
        item.addEventListener("click", () => {
            const target = item.dataset.viewTarget;
            if (!target) {
                return;
            }
            activateView(target);
        });
    });

    const defaultTarget = document.querySelector(".tool-menu-item.active")?.dataset.viewTarget ?? views[0].dataset.view;
    if (defaultTarget) {
        activateView(defaultTarget);
    }
}

// IP包协议类型映射
const IP_PROTOCOL_MAP = {
    0x01: "ICMP",
    0x02: "IGMP",
    0x06: "TCP",
    0x11: "UDP",
    0x29: "IPv6",
    0x3A: "ICMPv6",
};

// 计算IP头部校验和（验证模式：包含校验和字段一起计算，结果应为0xFFFF）
function calculateIpChecksum(bytes, headerLength) {
    let sum = 0;
    for (let i = 0; i < headerLength; i += 2) {
        const word = (bytes[i] << 8) | bytes[i + 1];
        sum += word;
    }
    // 处理溢出
    while (sum >>> 16) {
        sum = (sum & 0xffff) + (sum >>> 16);
    }
    // 验证时：如果所有字段（包括校验和）的和取反后为0，则校验和正确
    // 即 sum 应该等于 0xFFFF
    return sum;
}

// 解析并验证IP包
function parseAndValidateIpPacket(hexString) {
    const normalized = normalizeHex(hexString);
    if (!normalized) {
        throw new Error("请输入IP包数据。");
    }

    const bytes = hexStringToBytes(normalized);
    if (bytes.length < 20) {
        throw new Error(`IP包长度不足：至少需要20字节，实际只有${bytes.length}字节。`);
    }

    // 解析IP包头
    const version = (bytes[0] >>> 4) & 0x0f;
    const headerLength = (bytes[0] & 0x0f) * 4; // 单位是4字节
    const typeOfService = bytes[1];
    const totalLength = (bytes[2] << 8) | bytes[3];
    const identification = (bytes[4] << 8) | bytes[5];
    const flagsAndOffset = (bytes[6] << 8) | bytes[7];
    const flags = (flagsAndOffset >>> 13) & 0x07;
    const fragmentOffset = flagsAndOffset & 0x1fff;
    const ttl = bytes[8];
    const protocol = bytes[9];
    const headerChecksum = (bytes[10] << 8) | bytes[11];
    const sourceIp = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
    const destIp = `${bytes[16]}.${bytes[17]}.${bytes[18]}.${bytes[19]}`;

    // 验证结果
    const validations = {
        versionValid: version === 4,
        headerLengthValid: headerLength >= 20 && headerLength <= 60 && headerLength <= bytes.length,
        totalLengthValid: totalLength === bytes.length,
        checksumValid: false,
    };

    // 计算并验证校验和
    if (headerLength <= bytes.length) {
        const checksumSum = calculateIpChecksum(bytes, headerLength);
        // IP校验和验证：所有16位字（包括校验和字段）相加后应为0xFFFF
        validations.checksumValid = checksumSum === 0xffff;
    }

    // 解析选项（如果有）
    const options = headerLength > 20 ? bytes.slice(20, headerLength) : [];
    const payload = bytes.slice(headerLength);

    // 判断是否完整
    const isComplete = validations.versionValid &&
        validations.headerLengthValid &&
        validations.totalLengthValid &&
        validations.checksumValid;

    return {
        version,
        headerLength,
        typeOfService,
        totalLength,
        identification,
        flags,
        fragmentOffset,
        ttl,
        protocol,
        protocolName: IP_PROTOCOL_MAP[protocol] ?? "未知",
        headerChecksum,
        sourceIp,
        destIp,
        options,
        payload,
        validations,
        isComplete,
        actualLength: bytes.length,
        payloadLength: payload.length,
    };
}

// 渲染IP包验证结果
function renderIpValidationResult(result) {
    const container = document.getElementById("ipValidateResult");
    if (!container) {
        return;
    }

    if (!result) {
        container.innerHTML = "";
        return;
    }

    const validationStatus = result.isComplete
        ? '<span style="color: #16a34a; font-weight: 600;">✓ 完整的IP包</span>'
        : '<span style="color: #dc2626; font-weight: 600;">✗ IP包不完整或无效</span>';

    const validationDetails = [];
    if (!result.validations.versionValid) {
        validationDetails.push("版本号错误（应为4）");
    }
    if (!result.validations.headerLengthValid) {
        validationDetails.push(`头部长度无效（${result.headerLength}字节）`);
    }
    if (!result.validations.totalLengthValid) {
        validationDetails.push(`总长度不匹配（声明：${result.totalLength}字节，实际：${result.actualLength}字节）`);
    }
    if (!result.validations.checksumValid) {
        validationDetails.push("头部校验和错误");
    }

    const validationDetailsHtml = validationDetails.length > 0
        ? `<dt>验证问题</dt><dd style="color: #dc2626;">${validationDetails.join("；")}</dd>`
        : "";

    const optionsHex = result.options.length > 0 ? bytesToHex(result.options) : "(无)";
    const payloadHex = result.payload.length > 0 ? bytesToHex(result.payload) : "(无)";

    container.innerHTML = `
        <dl class="protocol-list">
            <dt>验证状态</dt>
            <dd>${validationStatus}</dd>
            <dt>版本</dt>
            <dd>${result.version} ${result.version === 4 ? "(IPv4)" : "(无效)"}</dd>
            <dt>头部长度</dt>
            <dd>${result.headerLength} 字节</dd>
            <dt>服务类型</dt>
            <dd>${formatByte(result.typeOfService)}</dd>
            <dt>总长度</dt>
            <dd>${result.totalLength} 字节 ${result.validations.totalLengthValid ? "✓" : "✗"}</dd>
            <dt>标识</dt>
            <dd>0x${result.identification.toString(16).padStart(4, "0").toUpperCase()}</dd>
            <dt>标志</dt>
            <dd>${formatByte(result.flags)} (${result.flags.toString(2).padStart(3, "0")})</dd>
            <dt>片偏移</dt>
            <dd>${result.fragmentOffset}</dd>
            <dt>TTL</dt>
            <dd>${result.ttl}</dd>
            <dt>协议</dt>
            <dd>${formatByte(result.protocol)} (${result.protocolName})</dd>
            <dt>头部校验和</dt>
            <dd>0x${result.headerChecksum.toString(16).padStart(4, "0").toUpperCase()} ${result.validations.checksumValid ? "✓" : "✗"}</dd>
            <dt>源IP地址</dt>
            <dd>${result.sourceIp}</dd>
            <dt>目标IP地址</dt>
            <dd>${result.destIp}</dd>
            <dt>选项</dt>
            <dd>${optionsHex}</dd>
            <dt>载荷长度</dt>
            <dd>${result.payloadLength} 字节</dd>
            <dt>载荷数据 (Hex)</dt>
            <dd>${payloadHex}</dd>
            <dt>实际数据长度</dt>
            <dd>${result.actualLength} 字节</dd>
            ${validationDetailsHtml}
        </dl>
    `;
}

// 绑定IP包验证工具
function attachIpValidator() {
    const validateBtn = document.getElementById("validateIpPacketBtn");
    const ipPacketInput = document.getElementById("ipPacketInput");
    const statusId = "ipValidateStatus";

    if (!validateBtn || !ipPacketInput) {
        return;
    }

    validateBtn.addEventListener("click", () => {
        try {
            const result = parseAndValidateIpPacket(ipPacketInput.value);
            renderIpValidationResult(result);
            if (result.isComplete) {
                setStatus("IP包验证通过：这是一个完整的IP包。", "success", statusId);
            } else {
                setStatus("IP包验证失败：存在错误或数据不完整。", "error", statusId);
            }
        } catch (error) {
            renderIpValidationResult(null);
            setStatus(error.message, "error", statusId);
        }
    });

    ipPacketInput.addEventListener("input", () => {
        setStatus("", "info", statusId);
    });
}

