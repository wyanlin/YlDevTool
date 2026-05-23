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

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function splitLogLines(text) {
    if (!text) {
        return [];
    }
    return text.split(/\r\n|\n|\r/);
}

function stripPairedQuotes(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
        return trimmed.slice(1, -1).trim();
    }
    return trimmed;
}

function extractAudioPayload(line, prefix) {
    const index = line.indexOf(prefix);
    if (index < 0) {
        return null;
    }

    return stripPairedQuotes(line.slice(index + prefix.length));
}

function stripTrailingLogQuote(value) {
    const trimmed = value.trim();
    return trimmed.endsWith("\"") ? trimmed.slice(0, -1).trim() : trimmed;
}

function decodeBase64ToBytes(payload) {
    const normalized = stripTrailingLogQuote(payload).replace(/\s+/g, "");
    if (!normalized) {
        throw new Error("Base64内容为空");
    }

    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
        throw new Error("Base64格式不正确");
    }

    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

function createAudioDirectionResult() {
    return {
        matchedLines: [],
        chunks: [],
        decodedLines: 0,
        skippedLines: 0,
        bytes: 0,
        failures: [],
    };
}

function appendAudioPayload(result, line, lineNumber, prefix) {
    const payload = extractAudioPayload(line, prefix);
    if (payload === null) {
        return false;
    }

    result.matchedLines.push(line);

    try {
        const bytes = decodeBase64ToBytes(payload);
        result.chunks.push(bytes);
        result.decodedLines += 1;
        result.bytes += bytes.byteLength;
    } catch (error) {
        result.skippedLines += 1;
        if (result.failures.length < 10) {
            result.failures.push({
                lineNumber,
                reason: error.message,
            });
        }
    }

    return true;
}

function getFilteredAudioEntries(text, initialFilter) {
    const filter = initialFilter.trim();
    return splitLogLines(text)
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter((entry) => !filter || entry.line.includes(filter));
}

function parseAudioPcmEntries(entries, options) {
    const sendPrefix = options.sendPrefix.trim();
    const recvPrefix = options.recvPrefix.trim();

    if (!sendPrefix) {
        throw new Error("音频数据发送前缀不能为空。");
    }
    if (!recvPrefix) {
        throw new Error("音频数据接收前缀不能为空。");
    }

    const filteredLines = entries ?? [];
    const send = createAudioDirectionResult();
    const recv = createAudioDirectionResult();

    filteredLines.forEach(({ line, lineNumber }) => {
        appendAudioPayload(send, line, lineNumber, sendPrefix);
        appendAudioPayload(recv, line, lineNumber, recvPrefix);
    });

    return {
        totalLines: options.totalLines ?? filteredLines.length,
        filteredLines: filteredLines.length,
        send,
        recv,
    };
}

function parseAudioPcmLog(text, options) {
    const entries = getFilteredAudioEntries(text, options.initialFilter ?? "");
    return parseAudioPcmEntries(entries, {
        ...options,
        totalLines: splitLogLines(text).length,
    });
}

function splitCsvFields(value) {
    const fields = [];
    let current = "";
    let inQuotes = false;

    for (const ch of value) {
        if (ch === "\"") {
            inQuotes = !inQuotes;
            current += ch;
            continue;
        }

        if (ch === "," && !inQuotes) {
            fields.push(current.trim());
            current = "";
            continue;
        }

        current += ch;
    }

    fields.push(current.trim());
    return fields;
}

function parseIntegerField(value) {
    const normalized = stripPairedQuotes(String(value ?? ""));
    if (!/^-?\d+$/.test(normalized)) {
        return null;
    }
    return parseInt(normalized, 10);
}

const DSCI_STAT_MAP = {
    0: "激活",
    1: "保持",
    2: "拨号",
    3: "报警",
    4: "引入",
    5: "等待",
    6: "终止",
};

function extractLogTimestamp(line) {
    const match = line.match(/\b\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\b/);
    return match ? match[0] : "未知时间";
}

function formatDsciStatus(stat) {
    const desc = DSCI_STAT_MAP[stat] ?? "未知状态";
    return stat === null ? "未知状态" : `${stat} ${desc}`;
}

function parseDsciEvent(line) {
    const marker = "^DSCI:";
    const index = line.indexOf(marker);
    if (index < 0) {
        return null;
    }

    const fields = splitCsvFields(stripTrailingLogQuote(line.slice(index + marker.length)));
    if (fields.length < 3) {
        return null;
    }

    return {
        id: parseIntegerField(fields[0]),
        idr: parseIntegerField(fields[1]),
        stat: parseIntegerField(fields[2]),
        type: parseIntegerField(fields[3]),
        mpty: parseIntegerField(fields[4]),
        number: stripPairedQuotes(fields[5] ?? ""),
        numType: parseIntegerField(fields[6]),
        cause: parseIntegerField(fields[8]),
        rawFields: fields,
    };
}

function parseAtdCallStart(line) {
    const match = line.match(/(?:^|[\s:>])ATD([^;\s"]+);/);
    if (!match) {
        return null;
    }

    return {
        number: match[1],
    };
}

function countAudioHits(entries, startIndex, endIndex, sendPrefix, recvPrefix) {
    let send = 0;
    let recv = 0;
    for (let i = startIndex; i <= endIndex; i += 1) {
        const line = entries[i]?.line ?? "";
        if (line.includes(sendPrefix)) {
            send += 1;
        }
        if (line.includes(recvPrefix)) {
            recv += 1;
        }
    }
    return { send, recv };
}

function createCallSegment({ direction, number, startEntry, startIndex, dsciId = null, startReason }) {
    return {
        direction,
        number: number || "未知号码",
        dsciId,
        startLineNumber: startEntry.lineNumber,
        endLineNumber: startEntry.lineNumber,
        startTime: extractLogTimestamp(startEntry.line),
        endTime: extractLogTimestamp(startEntry.line),
        startIndex,
        endIndex: startIndex,
        startReason,
        endReason: "",
        explicitEnd: false,
        answered: false,
        answerTime: "",
        stateChanges: [],
        sendHitCount: 0,
        recvHitCount: 0,
    };
}

function recordCallStateChange(call, entry, dsci) {
    if (!call || !dsci || dsci.stat === null) {
        return;
    }

    const last = call.stateChanges[call.stateChanges.length - 1];
    if (last && last.lineNumber === entry.lineNumber && last.stat === dsci.stat) {
        return;
    }

    const time = extractLogTimestamp(entry.line);
    call.stateChanges.push({
        lineNumber: entry.lineNumber,
        time,
        id: dsci.id,
        idr: dsci.idr,
        stat: dsci.stat,
        statusText: formatDsciStatus(dsci.stat),
        cause: dsci.cause,
    });

    if (dsci.stat === 0 && !call.answered) {
        call.answered = true;
        call.answerTime = time;
    }
}

function buildCallSegments(entries, options) {
    const sendPrefix = options.sendPrefix.trim();
    const recvPrefix = options.recvPrefix.trim();
    const calls = [];
    const activeCalls = [];
    const activeById = new Map();

    const removeActiveCall = (call) => {
        const index = activeCalls.indexOf(call);
        if (index >= 0) {
            activeCalls.splice(index, 1);
        }
        if (call.dsciId !== null) {
            activeById.delete(call.dsciId);
        }
    };

    const finalizeCall = (call, endIndex, reason, explicitEnd) => {
        if (call.endReason) {
            return;
        }
        const safeEndIndex = Math.max(call.startIndex, Math.min(endIndex, entries.length - 1));
        const audioHits = countAudioHits(entries, call.startIndex, safeEndIndex, sendPrefix, recvPrefix);
        call.endIndex = safeEndIndex;
        call.endLineNumber = entries[safeEndIndex]?.lineNumber ?? call.startLineNumber;
        call.endTime = entries[safeEndIndex] ? extractLogTimestamp(entries[safeEndIndex].line) : call.startTime;
        call.endReason = reason;
        call.explicitEnd = explicitEnd;
        call.sendHitCount = audioHits.send;
        call.recvHitCount = audioHits.recv;
        removeActiveCall(call);
    };

    const closeOpenCallsBefore = (entryIndex, reason) => {
        const endIndex = Math.max(0, entryIndex - 1);
        [...activeCalls].forEach((call) => finalizeCall(call, endIndex, reason, false));
    };

    entries.forEach((entry, entryIndex) => {
        const atd = parseAtdCallStart(entry.line);
        const dsci = parseDsciEvent(entry.line);
        const isIncomingStart = dsci && dsci.id !== null && dsci.idr === 1 && (dsci.stat === 4 || dsci.stat === 5);

        if (atd) {
            closeOpenCallsBefore(entryIndex, "未见明确结束，按下一通开始前兜底");
            const call = createCallSegment({
                direction: "主叫",
                number: atd.number,
                startEntry: entry,
                startIndex: entryIndex,
                startReason: "ATD语音拨号",
            });
            calls.push(call);
            activeCalls.push(call);
        }

        if (isIncomingStart && !activeById.has(dsci.id)) {
            closeOpenCallsBefore(entryIndex, "未见明确结束，按下一通开始前兜底");
            const call = createCallSegment({
                direction: "被叫",
                number: dsci.number,
                startEntry: entry,
                startIndex: entryIndex,
                dsciId: dsci.id,
                startReason: `DSCI来电状态${dsci.stat}`,
            });
            calls.push(call);
            activeCalls.push(call);
            activeById.set(dsci.id, call);
            recordCallStateChange(call, entry, dsci);
        }

        if (dsci && dsci.id !== null && dsci.stat !== 6) {
            const pendingOutgoing = activeCalls.find((call) => call.direction === "主叫" && call.dsciId === null && dsci.idr === 0);
            if (pendingOutgoing) {
                pendingOutgoing.dsciId = dsci.id;
                if (dsci.number) {
                    pendingOutgoing.number = dsci.number;
                }
                activeById.set(dsci.id, pendingOutgoing);
                recordCallStateChange(pendingOutgoing, entry, dsci);
            } else {
                const activeCall = activeById.get(dsci.id);
                if (activeCall) {
                    recordCallStateChange(activeCall, entry, dsci);
                }
            }
        }

        if (dsci && dsci.id !== null && dsci.stat === 6) {
            const call = activeById.get(dsci.id) ?? activeCalls[0];
            if (call) {
                recordCallStateChange(call, entry, dsci);
                finalizeCall(call, entryIndex, `DSCI状态6终止${dsci.cause !== null ? `，cause=${dsci.cause}` : ""}`, true);
            }
        }
    });

    if (entries.length > 0) {
        [...activeCalls].forEach((call) => finalizeCall(call, entries.length - 1, "未见明确结束，按文件末尾兜底", false));
    }

    return calls.map((call, index) => ({
        ...call,
        index,
        entries: entries.slice(call.startIndex, call.endIndex + 1),
    }));
}

function scanAudioCalls(text, options) {
    const sendPrefix = options.sendPrefix.trim();
    const recvPrefix = options.recvPrefix.trim();
    if (!sendPrefix) {
        throw new Error("音频数据发送前缀不能为空。");
    }
    if (!recvPrefix) {
        throw new Error("音频数据接收前缀不能为空。");
    }

    const totalLines = splitLogLines(text).length;
    const entries = getFilteredAudioEntries(text, options.initialFilter ?? "");
    const calls = buildCallSegments(entries, { sendPrefix, recvPrefix });

    return {
        totalLines,
        filteredLines: entries.length,
        entries,
        calls,
    };
}

const audioPcmDownloadUrls = [];

function releaseAudioPcmDownloadUrls() {
    while (audioPcmDownloadUrls.length > 0) {
        URL.revokeObjectURL(audioPcmDownloadUrls.pop());
    }
}

function createAudioDownloadFile(filename, blob) {
    const url = URL.createObjectURL(blob);
    audioPcmDownloadUrls.push(url);
    return {
        filename,
        blob,
        url,
        bytes: blob.size,
    };
}

function buildAudioDownloadFiles(result, call) {
    releaseAudioPcmDownloadUrls();

    const files = [];
    const prefix = `call_${String((call?.index ?? 0) + 1).padStart(3, "0")}`;
    if (result.send.matchedLines.length > 0) {
        files.push(createAudioDownloadFile(
            `${prefix}_send_pcm.txt`,
            new Blob([result.send.matchedLines.join("\n")], { type: "text/plain;charset=utf-8" })
        ));
    }
    if (result.recv.matchedLines.length > 0) {
        files.push(createAudioDownloadFile(
            `${prefix}_recv_pcm.txt`,
            new Blob([result.recv.matchedLines.join("\n")], { type: "text/plain;charset=utf-8" })
        ));
    }
    if (result.send.chunks.length > 0) {
        files.push(createAudioDownloadFile(
            `${prefix}_send_audio.pcm`,
            new Blob(result.send.chunks, { type: "application/octet-stream" })
        ));
    }
    if (result.recv.chunks.length > 0) {
        files.push(createAudioDownloadFile(
            `${prefix}_recv_audio.pcm`,
            new Blob(result.recv.chunks, { type: "application/octet-stream" })
        ));
    }

    return files;
}

function renderAudioScanResult(scanResult) {
    const container = document.getElementById("audioPcmResult");
    if (!container) {
        return;
    }

    releaseAudioPcmDownloadUrls();

    const callsHtml = scanResult.calls.length
        ? `
            <h3 class="download-title">通话概览</h3>
            <div class="call-list">
                ${scanResult.calls.map((call) => `
                    <div class="call-card">
                        <strong>#${call.index + 1} ${escapeHtml(call.direction)} ${escapeHtml(call.number)}</strong>
                        <span>开始：${escapeHtml(call.startTime)}（行 ${call.startLineNumber}）</span>
                        <span>结束：${escapeHtml(call.endTime)}（行 ${call.endLineNumber}，${escapeHtml(call.endReason)}）</span>
                        <span>接听：${call.answered ? `是，${escapeHtml(call.answerTime)}` : "否"}</span>
                        <span>发送音频 ${call.sendHitCount} 行，接收音频 ${call.recvHitCount} 行</span>
                        <div class="call-state-list">
                            ${call.stateChanges.length
                                ? call.stateChanges.map((state) => `<span>行 ${state.lineNumber} ${escapeHtml(state.time)}：${escapeHtml(state.statusText)}${state.cause !== null ? `，cause=${state.cause}` : ""}</span>`).join("")
                                : "<span>未记录到DSCI状态变化</span>"}
                        </div>
                    </div>
                `).join("")}
            </div>
        `
        : "";

    container.innerHTML = `
        <dl class="protocol-list">
            <dt>原始行数</dt>
            <dd>${scanResult.totalLines}</dd>
            <dt>初筛命中数</dt>
            <dd>${scanResult.filteredLines}</dd>
            <dt>识别通话数</dt>
            <dd>${scanResult.calls.length}</dd>
        </dl>
        ${callsHtml}
    `;
}

function renderAudioPcmResult(result, files = [], call = null) {
    const container = document.getElementById("audioPcmResult");
    if (!container) {
        return;
    }

    if (!result) {
        container.innerHTML = "";
        releaseAudioPcmDownloadUrls();
        return;
    }

    const skippedLines = result.send.skippedLines + result.recv.skippedLines;
    const decodedLines = result.send.decodedLines + result.recv.decodedLines;
    const failures = [...result.send.failures, ...result.recv.failures];
    const failureHtml = failures.length
        ? `<dt>跳过明细</dt><dd>${failures.map((item) => `行 ${item.lineNumber}: ${escapeHtml(item.reason)}`).join("<br>")}</dd>`
        : "";
    const callHtml = call
        ? `
            <dt>所选通话</dt>
            <dd>#${call.index + 1} ${escapeHtml(call.direction)} ${escapeHtml(call.number)}，行 ${call.startLineNumber} - ${call.endLineNumber}</dd>
            <dt>开始时间</dt>
            <dd>${escapeHtml(call.startTime)}</dd>
            <dt>结束时间</dt>
            <dd>${escapeHtml(call.endTime)}</dd>
            <dt>是否接听</dt>
            <dd>${call.answered ? `是，${escapeHtml(call.answerTime)}` : "否"}</dd>
            <dt>结束状态</dt>
            <dd>${call.explicitEnd ? "明确结束" : "兜底结束"}：${escapeHtml(call.endReason)}</dd>
            <dt>状态变化</dt>
            <dd>${call.stateChanges.length
                ? call.stateChanges.map((state) => `行 ${state.lineNumber} ${escapeHtml(state.time)}：${escapeHtml(state.statusText)}${state.cause !== null ? `，cause=${state.cause}` : ""}`).join("<br>")
                : "未记录到DSCI状态变化"}</dd>
        `
        : "";
    const sendWriteStatus = result.send.chunks.length > 0
        ? `成功，${result.send.bytes} 字节`
        : "未生成该方向PCM";
    const recvWriteStatus = result.recv.chunks.length > 0
        ? `成功，${result.recv.bytes} 字节`
        : "未生成该方向PCM";
    const downloadHtml = files.length
        ? `
            <h3 class="download-title">生成文件</h3>
            <div class="download-list">
                ${files.map((file) => `<a class="download-link" href="${file.url}" download="${escapeHtml(file.filename)}">${escapeHtml(file.filename)}（${file.bytes} 字节）</a>`).join("")}
            </div>
        `
        : "";

    container.innerHTML = `
        <dl class="protocol-list">
            ${callHtml}
            <dt>原始行数</dt>
            <dd>${result.totalLines}</dd>
            <dt>本通话解析行数</dt>
            <dd>${result.filteredLines}</dd>
            <dt>发送命中数</dt>
            <dd>${result.send.matchedLines.length}</dd>
            <dt>接收命中数</dt>
            <dd>${result.recv.matchedLines.length}</dd>
            <dt>成功解码行数</dt>
            <dd>${decodedLines}（发送 ${result.send.decodedLines}，接收 ${result.recv.decodedLines}）</dd>
            <dt>跳过行数</dt>
            <dd>${skippedLines}</dd>
            <dt>发送PCM写入</dt>
            <dd>${sendWriteStatus}</dd>
            <dt>接收PCM写入</dt>
            <dd>${recvWriteStatus}</dd>
            ${failureHtml}
        </dl>
        ${downloadHtml}
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

const TT_LOG_PROFILE_LABELS = {
    tt_call: "天通电话事件上报",
    tt_audio: "Audio语音事件上报",
    tt_sms: "短信入网事件上报",
    power_sleep: "功耗休眠事件上报",
};

const TT_LOG_SOURCE_PRESETS = {
    tt_default: {
        atTags: "RIL_TT-AT",
        rilTags: "RIL_TT",
        helperKeywords: "AudioService,AudioManager,AudioFlinger,Telecom,InCall,PowerManager,wakelock,wake_lock,modem sleep,CP2AP_WAKEUP,suspend,resume,SMS,CREG,SATSIGNAL",
        matchRealTagOnly: true,
        dedupeEnabled: true,
    },
};

const TT_LOG_SOURCE_STATE_KEY = "mydevtools.ttLogSourceConfig.v1";

const TT_LOG_SOURCE_LABELS = {
    at: "原始串口交互",
    ril: "RIL业务日志",
    helper: "辅助日志",
    unknown: "未知来源",
};

const TT_LOG_SOURCE_PRIORITY = {
    at: 3,
    ril: 2,
    helper: 1,
    unknown: 0,
};

const TT_CLCC_STAT_MAP = {
    0: "通话中",
    1: "保持",
    2: "拨号中",
    3: "振铃中",
    4: "来电",
    5: "等待",
    6: "结束",
};

const TT_LOG_RULES = [
    {
        profile: "tt_call",
        type: "tt_switch",
        category: "天通开关",
        match(line) {
            const match = line.match(/setTTMode current ttEnable:\s*(\d+)/);
            if (!match) return null;
            const enabled = match[1] === "1";
            return {
                message: enabled ? "关闭天通开关" : "打开天通开关",
                fields: { ttEnable: match[1] },
                severity: "info",
            };
        },
    },
    {
        profile: "tt_call",
        type: "antenna",
        category: "天线设置",
        match(line) {
            const match = line.match(/AT\^VOICERATE=(\d+)/);
            if (!match) return null;
            const rate = match[1];
            return {
                message: rate === "4" ? "设置为内置天线" : `设置语音天线参数 VOICERATE=${rate}`,
                fields: { voiceRate: rate },
                severity: "info",
            };
        },
    },
    {
        profile: "tt_call",
        type: "dial",
        category: "主叫",
        match(line) {
            const event = parseAtdCallStart(line);
            if (!event) return null;
            return {
                message: `发起主叫 ${event.number}`,
                fields: { number: event.number },
                severity: "important",
            };
        },
    },
    {
        profile: "tt_call",
        type: "clcc",
        category: "通话状态",
        match(line) {
            const marker = "+CLCC:";
            const index = line.indexOf(marker);
            if (index < 0) return null;
            const fields = splitCsvFields(stripTrailingLogQuote(line.slice(index + marker.length)));
            const id = parseIntegerField(fields[0]);
            const idr = parseIntegerField(fields[1]);
            const stat = parseIntegerField(fields[2]);
            const number = stripPairedQuotes(fields[5] ?? "");
            const statusText = TT_CLCC_STAT_MAP[stat] ?? "未知状态";
            return {
                message: `${idr === 1 ? "被叫" : "主叫"}通话状态：${statusText}${number ? ` ${number}` : ""}`,
                fields: { id, idr, stat, number },
                severity: stat === 6 ? "warning" : "info",
            };
        },
    },
    {
        profile: "tt_call",
        type: "dsci",
        category: "DSCI状态",
        match(line) {
            const dsci = parseDsciEvent(line);
            if (!dsci) return null;
            const statusText = DSCI_STAT_MAP[dsci.stat] ?? "未知状态";
            const direction = dsci.idr === 1 ? "被叫" : "主叫";
            const causeText = dsci.cause !== null ? `，cause=${dsci.cause}` : "";
            return {
                message: `${direction}DSCI状态：${statusText}${dsci.number ? ` ${dsci.number}` : ""}${causeText}`,
                fields: dsci,
                severity: dsci.stat === 6 ? "warning" : "important",
            };
        },
    },
    {
        profile: "tt_call",
        type: "carrier_release",
        category: "链路释放",
        match(line) {
            if (!line.includes("NO CARRIER")) return null;
            return {
                message: "链路释放 NO CARRIER",
                fields: {},
                severity: "warning",
            };
        },
    },
    {
        profile: "tt_call",
        type: "network_state",
        category: "网络状态",
        match(line) {
            const creg = line.match(/\+CREG:\s*([^,\s]+),?([^\s]*)?/);
            if (!creg) return null;
            return {
                message: `网络注册状态 CREG=${creg[1]}${creg[2] ? `,${creg[2]}` : ""}`,
                fields: { creg: creg[0] },
                severity: "info",
            };
        },
    },
    {
        profile: "tt_call",
        type: "signal",
        category: "信号",
        match(line) {
            const signal = line.match(/\^SATSIGNAL:\s*(-?\d+),(\d+)/);
            if (!signal) return null;
            return {
                message: `天通信号 rssi=${signal[1]}, snr=${signal[2]}`,
                fields: { rssi: signal[1], snr: signal[2] },
                severity: "info",
            };
        },
    },
    {
        profile: "tt_audio",
        type: "audio_route",
        category: "Audio",
        match(line) {
            if (!/(AudioService|AudioManager|AudioFlinger|AudioFocus|MODE_IN_COMMUNICATION|speaker|route)/i.test(line)) {
                return null;
            }
            return {
                message: "Audio语音链路事件",
                fields: {},
                severity: /fail|error|denied/i.test(line) ? "warning" : "info",
            };
        },
    },
    {
        profile: "power_sleep",
        type: "power",
        category: "功耗休眠",
        match(line) {
            if (!/(wakelock|wake_lock|screen state|SCREEN_|modem sleep|CP2AP_WAKEUP|suspend|resume)/i.test(line)) {
                return null;
            }
            return {
                message: "功耗/休眠链路事件",
                fields: {},
                severity: /timeout|fail|abort/i.test(line) ? "warning" : "info",
            };
        },
    },
    {
        profile: "tt_sms",
        type: "sms",
        category: "短信入网",
        match(line) {
            if (!/(\+CMT|\+CMGL|\+CMGS|SMS|NEW_SMS|CMTI|CREG|SATSIGNAL)/i.test(line)) {
                return null;
            }
            return {
                message: "短信/入网相关事件",
                fields: {},
                severity: /fail|error/i.test(line) ? "warning" : "info",
            };
        },
    },
];

// ==================== 逐行注解：AT 指令字典 ====================
const TT_AT_COMMAND_DICT = {
    "+CREG":       { name: "网络注册状态",      desc: "查询或上报网络注册状态，0=未注册 1=已注册本地 2=正在搜索 3=注册被拒绝 5=已注册漫游" },
    "^SATSIGNAL":  { name: "卫星信号强度",      desc: "主动查询或URC上报天通卫星信号，返回 RSSI(dBm) 和 SNR(dB)" },
    "^VOICERATE":  { name: "语音天线速率",      desc: "设置语音天线编码速率，4=内置天线模式 5=外置天线模式" },
    "^DSCI":       { name: "通话状态变化",      desc: "URC上报通话状态变化：0=激活 1=保持 2=拨号 3=报警 4=引入 5=等待 6=终止" },
    "+CLCC":       { name: "当前通话列表",      desc: "查询当前通话列表，返回通话ID、方向、状态、号码、类型" },
    "+CMGS":       { name: "发送短信",          desc: "发送短信指令，后跟PDU编码的短信内容" },
    "+CMGL":       { name: "列出短信",          desc: "从短信存储中按状态列出短信" },
    "+CMGR":       { name: "读取短信",          desc: "从存储中读取指定索引的短信" },
    "+CMGD":       { name: "删除短信",          desc: "删除存储中指定索引的短信" },
    "+CNMI":       { name: "新消息指示",        desc: "设置新短信到达时的URC上报行为" },
    "+CPMS":       { name: "短信存储位置",      desc: "选择短信读写存储位置（ME/SM）" },
    "+CSQ":        { name: "信号质量查询",      desc: "查询信号质量，返回 RSSI 和 BER（误码率）" },
    "+CPIN":       { name: "PIN码管理",         desc: "输入或验证SIM卡PIN码以解锁" },
    "+CPAS":       { name: "电话活动状态",      desc: "查询电话活动状态：0=就绪 3=振铃 4=通话中" },
    "+CFUN":       { name: "模块功能设置",      desc: "设置模块功能级别：0=最小功能 1=全功能 4=飞行模式" },
    "+CMEE":       { name: "错误报告格式",      desc: "设置错误报告格式：0=关闭 1=数字错误码 2=详细文字描述" },
    "+CGATT":      { name: "GPRS附着/分离",     desc: "附着或分离GPRS数据服务" },
    "+COPS":       { name: "运营商选择",        desc: "查询或选择网络运营商" },
    "+CLIP":       { name: "来电显示设置",      desc: "启用或禁用来电号码显示URC" },
    "+CCWA":       { name: "呼叫等待设置",      desc: "启用或禁用呼叫等待功能" },
    "+CHLD":       { name: "呼叫保持/多方通话", desc: "呼叫保持、释放、切换及多方通话控制" },
    "+CSCS":       { name: "字符集设置",        desc: "设置TE字符集编码" },
    "+CGMR":       { name: "模块版本查询",      desc: "查询模块固件版本信息" },
    "+CGSN":       { name: "IMEI查询",          desc: "查询模块IMEI序列号" },
    "+CIMI":       { name: "IMSI查询",          desc: "查询SIM卡IMSI" },
    "+CBC":        { name: "小区广播",          desc: "小区广播消息相关指令" },
    "+CUSD":       { name: "非结构化补充数据",  desc: "USSD非结构化补充业务数据" },
    "+CRES":       { name: "恢复网络注册",      desc: "恢复网络注册URC上报" },
    "+CRSM":       { name: "受限SIM访问",       desc: "受限方式访问SIM卡EF文件" },
    "NO CARRIER":  { name: "链路释放",          desc: "数据/语音链路因挂断、无信号或其他原因被释放" },
    "DAUDPCM":     { name: "音频PCM数据",       desc: "通过串口传输音频PCM数据（Base64编码）" },
    "BUSY":        { name: "线路忙",            desc: "被叫线路忙" },
    "NO ANSWER":   { name: "无应答",            desc: "被叫无应答" },
    "ERROR":       { name: "指令错误",          desc: "AT指令执行返回错误" },
    "OK":          { name: "指令成功",          desc: "AT指令执行成功" },
};

// ==================== 逐行注解：辅助解释函数 ====================
function interpretRssi(rssi) {
    if (rssi >= -70) return "强信号";
    if (rssi >= -85) return "中等信号";
    if (rssi >= -100) return "弱信号";
    return "信号极弱";
}

function interpretSnr(snr) {
    if (snr >= 20) return "信噪比优秀";
    if (snr >= 10) return "信噪比良好";
    if (snr >= 5) return "信噪比较低";
    return "信噪比差";
}

function interpretCregState(state) {
    var map = { 0: "未注册，不在搜索中", 1: "已注册本地网络", 2: "正在搜索网络", 3: "注册被拒绝", 4: "未知状态", 5: "已注册漫游网络" };
    return map[state] || "未知状态(" + state + ")";
}

function interpretClccStat(stat) {
    return TT_CLCC_STAT_MAP[stat] || "未知状态(" + stat + ")";
}

function parseAtCommandsFromLine(line) {
    var results = [];
    var pattern = /(?:AT([+^][A-Z]+)|AT(D)(\d+)?|(?:ATS)(\d+)|(NO\s+CARRIER)|(BUSY)|(NO\s+ANSWER)|(?<!\w)(ERROR)(?!\w)|(?<!\w)(OK)(?!\w))/gi;
    var match;
    while ((match = pattern.exec(line)) !== null) {
        var basename = match[1] || match[2] || ("S" + (match[5] || "")) || match[6] || match[7] || match[8] || match[9] || "";
        var raw = match[0].toUpperCase();
        var entry = TT_AT_COMMAND_DICT[basename] || null;
        results.push({ raw: raw, basename: basename, entry: entry });
    }
    return results;
}

// ==================== 逐行注解：注解器 ====================
var TT_LOG_ANNOTATORS = [
    {
        type: "at_command",
        category: "AT命令识别",
        match: function (line) {
            var cmds = parseAtCommandsFromLine(line);
            if (!cmds.length) return null;
            return {
                annotations: cmds.map(function (c) {
                    return {
                        text: c.entry ? c.raw + ": " + c.entry.name + " — " + c.entry.desc : c.raw + ": 未收录的AT指令",
                        severity: "info",
                    };
                }),
            };
        },
    },
    {
        type: "tt_mode",
        category: "天通模式",
        match: function (line) {
            var m = line.match(/setTTMode current ttEnable:\s*(\d+)/);
            if (!m) return null;
            var enabled = m[1] === "1";
            return {
                annotations: [{
                    text: enabled ? "天通已启用 (ttEnable=1)，模组进入卫星通信模式" : "天通已关闭 (ttEnable=0)，模组退回地面模式",
                    severity: "important",
                }],
            };
        },
    },
    {
        type: "signal",
        category: "信号强度",
        match: function (line) {
            var m = line.match(/\^SATSIGNAL:\s*(-?\d+),(\d+)/);
            if (!m) return null;
            var rssi = parseInt(m[1], 10);
            var snr = parseInt(m[2], 10);
            return {
                annotations: [{
                    text: "RSSI=" + rssi + "dBm (" + interpretRssi(rssi) + "), SNR=" + snr + "dB (" + interpretSnr(snr) + ")",
                    severity: rssi < -100 ? "warning" : "info",
                    fields: { rssi: rssi, snr: snr },
                }],
            };
        },
    },
    {
        type: "network_state",
        category: "网络注册",
        match: function (line) {
            var m = line.match(/\+CREG:\s*(\d+)/);
            if (!m) return null;
            var state = parseInt(m[1], 10);
            return {
                annotations: [{
                    text: "网络注册状态变化: " + interpretCregState(state),
                    severity: (state === 1 || state === 5) ? "info" : "warning",
                    fields: { cregState: state },
                }],
            };
        },
    },
    {
        type: "antenna",
        category: "天线设置",
        match: function (line) {
            var m = line.match(/AT\^VOICERATE=(\d+)/);
            if (!m) return null;
            var rate = m[1];
            return {
                annotations: [{
                    text: rate === "4" ? "设置为内置天线 (VOICERATE=4)" : "设置为外置天线 (VOICERATE=" + rate + ")",
                    severity: "info",
                }],
            };
        },
    },
    {
        type: "call_dial",
        category: "主叫",
        match: function (line) {
            var event = parseAtdCallStart(line);
            if (!event) return null;
            return {
                annotations: [{
                    text: "发起主叫，被叫号码: " + event.number,
                    severity: "important",
                    fields: { number: event.number },
                }],
            };
        },
    },
    {
        type: "call_state",
        category: "通话状态",
        match: function (line) {
            var marker = "+CLCC:";
            var index = line.indexOf(marker);
            if (index < 0) return null;
            var fields = splitCsvFields(stripTrailingLogQuote(line.slice(index + marker.length)));
            var id = parseIntegerField(fields[0]);
            var idr = parseIntegerField(fields[1]);
            var stat = parseIntegerField(fields[2]);
            var number = stripPairedQuotes(fields[5] || "");
            var statusText = interpretClccStat(stat);
            return {
                annotations: [{
                    text: (idr === 1 ? "被叫" : "主叫") + "通话状态变化: " + statusText + (number ? " " + number : ""),
                    severity: stat === 6 ? "warning" : "info",
                    fields: { id: id, idr: idr, stat: stat, number: number },
                }],
            };
        },
    },
    {
        type: "call_dsci",
        category: "通话状态",
        match: function (line) {
            var dsci = parseDsciEvent(line);
            if (!dsci) return null;
            var statusText = DSCI_STAT_MAP[dsci.stat] || "未知状态";
            var direction = dsci.idr === 1 ? "被叫" : "主叫";
            var causeText = dsci.cause !== null ? "，cause=" + dsci.cause : "";
            return {
                annotations: [{
                    text: direction + "DSCI状态变化: " + statusText + (dsci.number ? " " + dsci.number : "") + causeText,
                    severity: dsci.stat === 6 ? "warning" : "important",
                    fields: dsci,
                }],
            };
        },
    },
    {
        type: "call_release",
        category: "链路释放",
        match: function (line) {
            if (line.indexOf("NO CARRIER") < 0) return null;
            return {
                annotations: [{
                    text: "链路释放（NO CARRIER），通话或数据连接已断开",
                    severity: "warning",
                }],
            };
        },
    },
    {
        type: "process",
        category: "进程事件",
        match: function (line) {
            var startMatch = line.match(/start\s+(\S*rild\S*)/i);
            if (startMatch) {
                return {
                    annotations: [{
                        text: "启动进程: " + startMatch[1] + "，负责卫星通信RIL层交互",
                        severity: "info",
                    }],
                };
            }
            if (/died|killed|crash/i.test(line)) {
                return {
                    annotations: [{
                        text: "进程异常终止（died/killed/crash），可能导致卫星服务中断",
                        severity: "warning",
                    }],
                };
            }
            if (/ANR\s+in\s+(\S+)/i.test(line)) {
                return {
                    annotations: [{
                        text: "应用无响应(ANR): " + (line.match(/ANR\s+in\s+(\S+)/i) || [])[1] + "，主线程阻塞超过5秒",
                        severity: "warning",
                    }],
                };
            }
            return null;
        },
    },
    {
        type: "sms",
        category: "短信事件",
        match: function (line) {
            var cmtMatch = line.match(/\+CMT:\s*"([^"]*)"/);
            if (cmtMatch) {
                return {
                    annotations: [{
                        text: "收到新短信 (CMT)，发件人: " + cmtMatch[1],
                        severity: "important",
                    }],
                };
            }
            if (line.indexOf("+CMTI:") >= 0) {
                return {
                    annotations: [{
                        text: "新短信到达指示 (CMTI)，短信已存储在SIM卡或模块内存",
                        severity: "info",
                    }],
                };
            }
            if (line.indexOf("+CMGS:") >= 0) {
                return {
                    annotations: [{
                        text: "短信发送成功 (CMGS)",
                        severity: "info",
                    }],
                };
            }
            return null;
        },
    },
    {
        type: "error",
        category: "异常检测",
        match: function (line) {
            if (!/(fail|error|timeout|abort|denied|reject|exception|crash)/i.test(line)) return null;
            return {
                annotations: [{
                    text: "包含异常/失败关键词，可能指示一个问题",
                    severity: "warning",
                }],
            };
        },
    },
];

// ==================== 逐行注解：状态追踪器 ====================
var TT_LOG_STATE_TRACKERS = [
    {
        id: "signal",
        label: "信号强度",
        extract: function (line, lineNumber) {
            var m = line.match(/\^SATSIGNAL:\s*(-?\d+),(\d+)/);
            if (!m) return null;
            return {
                time: extractLogTimestamp(line),
                lineNumber: lineNumber,
                rssi: parseInt(m[1], 10),
                snr: parseInt(m[2], 10),
            };
        },
    },
    {
        id: "network",
        label: "网络注册",
        extract: function (line, lineNumber) {
            var m = line.match(/\+CREG:\s*(\d+)/);
            if (!m) return null;
            var state = parseInt(m[1], 10);
            return {
                time: extractLogTimestamp(line),
                lineNumber: lineNumber,
                state: state,
                label: interpretCregState(state),
            };
        },
    },
    {
        id: "call",
        label: "通话状态",
        extract: function (line, lineNumber) {
            var dsci = parseDsciEvent(line);
            if (!dsci) return null;
            return {
                time: extractLogTimestamp(line),
                lineNumber: lineNumber,
                id: dsci.id,
                idr: dsci.idr,
                stat: dsci.stat,
                number: dsci.number,
                label: (DSCI_STAT_MAP[dsci.stat] || "未知") + (dsci.number ? " " + dsci.number : ""),
            };
        },
    },
];

var ttLogReportDownloadUrl = "";
let ttLogConfigDownloadUrl = "";

function parseTtLogLine(line, lineNumber) {
    const timestamp = extractLogTimestamp(line);
    const match = line.match(/\b\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3}\s+\d+\s+\d+\s+[A-Z]\s+([^:]+):/);
    return {
        line,
        lineNumber,
        time: timestamp,
        tag: match ? match[1].trim() : "未知Tag",
    };
}

function parseTtLogFilters(value) {
    if (Array.isArray(value)) return value;
    return String(value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
}

function buildTtLogSourceConfig(options) {
    return {
        preset: options.preset || "tt_default",
        atTags: parseTtLogFilters(options.atTags ?? ""),
        rilTags: parseTtLogFilters(options.rilTags ?? ""),
        helperKeywords: parseTtLogFilters(options.helperKeywords ?? ""),
        matchRealTagOnly: Boolean(options.matchRealTagOnly),
        dedupeEnabled: Boolean(options.dedupeEnabled),
    };
}

function saveTtLogSourceConfig(config) {
    try {
        localStorage.setItem(TT_LOG_SOURCE_STATE_KEY, JSON.stringify(config));
    } catch (error) {
        // Ignore storage failures; scanning should still work.
    }
}

function loadTtLogSourceConfig() {
    try {
        const saved = JSON.parse(localStorage.getItem(TT_LOG_SOURCE_STATE_KEY) || "null");
        if (saved && typeof saved === "object") {
            return saved;
        }
    } catch (error) {
        // Fall back to the built-in preset.
    }
    return {
        preset: "tt_default",
        ...TT_LOG_SOURCE_PRESETS.tt_default,
    };
}

function releaseTtLogConfigDownloadUrl() {
    if (ttLogConfigDownloadUrl) {
        URL.revokeObjectURL(ttLogConfigDownloadUrl);
        ttLogConfigDownloadUrl = "";
    }
}

function exportTtLogSourceConfigFile(config) {
    releaseTtLogConfigDownloadUrl();
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        type: "tt-log-source-config",
        config,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    ttLogConfigDownloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = ttLogConfigDownloadUrl;
    link.download = "tt-log-source-config.json";
    link.click();
}

async function importTtLogSourceConfigFile(file) {
    const text = await file.text();
    let payload = null;
    try {
        payload = JSON.parse(text);
    } catch (error) {
        throw new Error("配置文件不是有效 JSON。");
    }

    const config = payload?.config ?? payload;
    if (!config || typeof config !== "object") {
        throw new Error("配置文件缺少 config 对象。");
    }

    const normalized = {
        preset: typeof config.preset === "string" ? config.preset : "custom",
        atTags: typeof config.atTags === "string" ? config.atTags : "",
        rilTags: typeof config.rilTags === "string" ? config.rilTags : "",
        helperKeywords: typeof config.helperKeywords === "string" ? config.helperKeywords : "",
        matchRealTagOnly: config.matchRealTagOnly !== false,
        dedupeEnabled: config.dedupeEnabled !== false,
    };

    if (!normalized.atTags && !normalized.rilTags && !normalized.helperKeywords) {
        throw new Error("配置文件至少需要包含一个 TAG 或关键词。");
    }

    return normalized;
}

function tagStartsWithAny(tag, prefixes) {
    return prefixes.some((prefix) => prefix && tag.startsWith(prefix));
}

function classifyTtLogSource(parsed, sourceConfig) {
    if (tagStartsWithAny(parsed.tag, sourceConfig.atTags)) {
        return { kind: "at", label: TT_LOG_SOURCE_LABELS.at };
    }
    if (tagStartsWithAny(parsed.tag, sourceConfig.rilTags)) {
        return { kind: "ril", label: TT_LOG_SOURCE_LABELS.ril };
    }
    if (sourceConfig.helperKeywords.some((keyword) => parsed.tag.startsWith(keyword) || parsed.line.includes(keyword))) {
        return { kind: "helper", label: TT_LOG_SOURCE_LABELS.helper };
    }
    return { kind: "unknown", label: TT_LOG_SOURCE_LABELS.unknown };
}

function ttLogLineMatchesSource(parsed, sourceConfig) {
    const source = classifyTtLogSource(parsed, sourceConfig);
    if (source.kind === "at" || source.kind === "ril") {
        return source;
    }
    if (!sourceConfig.matchRealTagOnly && source.kind === "helper") {
        return source;
    }
    if (sourceConfig.matchRealTagOnly && source.kind === "helper") {
        return source;
    }
    return null;
}

function normalizeTtLogPayload(value) {
    return String(value ?? "")
        .replace(/\s+/g, " ")
        .trim();
}

function getTtLogEventFingerprint(event) {
    const fields = event.fields ?? {};
    switch (event.type) {
        case "dsci":
            return `dsci:${fields.id}:${fields.idr}:${fields.stat}:${fields.number}:${fields.cause}`;
        case "clcc":
            return `clcc:${fields.id}:${fields.idr}:${fields.stat}:${fields.number}`;
        case "dial":
            return `dial:${fields.number}`;
        case "antenna":
            return `antenna:${fields.voiceRate}`;
        case "carrier_release":
            return "carrier_release:NO_CARRIER";
        case "tt_switch":
            return `tt_switch:${fields.ttEnable}`;
        default:
            return `${event.type}:${normalizeTtLogPayload(event.message)}`;
    }
}

function getTtLogEventTimeBucket(event) {
    const match = String(event.time ?? "").match(/^(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
    return match ? match[1] : event.time;
}

function dedupeTtLogEvents(events) {
    const byKey = new Map();
    let duplicateCount = 0;

    events.forEach((event) => {
        const key = `${getTtLogEventTimeBucket(event)}|${getTtLogEventFingerprint(event)}`;
        const existing = byKey.get(key);
        if (!existing) {
            byKey.set(key, { ...event, duplicateCount: 0 });
            return;
        }

        duplicateCount += 1;
        const existingPriority = TT_LOG_SOURCE_PRIORITY[existing.sourceKind] ?? 0;
        const eventPriority = TT_LOG_SOURCE_PRIORITY[event.sourceKind] ?? 0;
        if (eventPriority > existingPriority) {
            byKey.set(key, { ...event, duplicateCount: existing.duplicateCount + 1 });
        } else {
            existing.duplicateCount += 1;
        }
    });

    return {
        events: [...byKey.values()].sort((left, right) => left.lineNumber - right.lineNumber),
        duplicateCount,
    };
}

function scanTtLogEvents(text, options) {
    const selectedProfiles = new Set(options.profiles);
    const sourceConfig = buildTtLogSourceConfig(options.sourceConfig ?? {});
    const rules = TT_LOG_RULES.filter((rule) => selectedProfiles.has(rule.profile));
    const lines = splitLogLines(text);
    const events = [];
    let filteredLines = 0;

    lines.forEach((line, index) => {
        const parsed = parseTtLogLine(line, index + 1);
        const source = ttLogLineMatchesSource(parsed, sourceConfig);
        if (!source) {
            return;
        }
        filteredLines += 1;

        for (const rule of rules) {
            if (sourceConfig.matchRealTagOnly && rule.profile === "tt_call" && source.kind === "helper") {
                continue;
            }
            const matched = rule.match(line);
            if (!matched) {
                continue;
            }
            events.push({
                ...parsed,
                profile: rule.profile,
                profileLabel: TT_LOG_PROFILE_LABELS[rule.profile] ?? rule.profile,
                type: rule.type,
                category: rule.category,
                message: matched.message,
                fields: matched.fields ?? {},
                severity: matched.severity ?? "info",
                sourceKind: source.kind,
                sourceLabel: source.label,
            });
        }
    });

    const dedupeResult = sourceConfig.dedupeEnabled ? dedupeTtLogEvents(events) : { events, duplicateCount: 0 };

    return {
        totalLines: lines.length,
        filteredLines,
        profiles: [...selectedProfiles],
        sourceConfig,
        events: dedupeResult.events,
        rawEventCount: events.length,
        duplicateCount: dedupeResult.duplicateCount,
    };
}

function summarizeTtLogEvents(scanResult) {
    const summary = {
        totalLines: scanResult?.totalLines ?? 0,
        filteredLines: scanResult?.filteredLines ?? 0,
        totalEvents: scanResult?.events.length ?? 0,
        rawEventCount: scanResult?.rawEventCount ?? 0,
        duplicateCount: scanResult?.duplicateCount ?? 0,
        warnings: 0,
        byProfile: {},
        byCategory: {},
    };

    (scanResult?.events ?? []).forEach((event) => {
        if (event.severity === "warning") {
            summary.warnings += 1;
        }
        summary.byProfile[event.profileLabel] = (summary.byProfile[event.profileLabel] ?? 0) + 1;
        summary.byCategory[event.category] = (summary.byCategory[event.category] ?? 0) + 1;
    });

    return summary;
}

function renderTtLogSummary(scanResult) {
    const container = document.getElementById("ttLogSummary");
    if (!container) return;
    if (!scanResult) {
        container.innerHTML = "";
        return;
    }

    const summary = summarizeTtLogEvents(scanResult);
    const cards = [
        ["总行数", summary.totalLines],
        ["初筛行数", summary.filteredLines],
        ["命中事件", summary.totalEvents],
        ["合并重复", summary.duplicateCount],
        ["风险/失败事件", summary.warnings],
        ...Object.entries(summary.byProfile),
        ...Object.entries(summary.byCategory),
    ];

    container.innerHTML = cards.map(([label, value]) => `
        <div class="metric-card">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join("");
}

function renderTtLogTimeline(scanResult) {
    const container = document.getElementById("ttLogTimeline");
    if (!container) return;
    if (!scanResult || scanResult.events.length === 0) {
        container.innerHTML = "";
        return;
    }

    container.innerHTML = scanResult.events.map((event) => `
        <article class="timeline-item timeline-${escapeHtml(event.severity)}">
            <div class="timeline-main">
                <strong>${escapeHtml(event.time)}</strong>
                <span>${escapeHtml(event.message)}</span>
            </div>
            <div class="timeline-meta">行 ${event.lineNumber} | ${escapeHtml(event.tag)} | ${escapeHtml(event.sourceLabel)} | ${escapeHtml(event.profileLabel)} / ${escapeHtml(event.category)}${event.duplicateCount ? ` | 已合并重复 ${event.duplicateCount} 条` : ""}</div>
            <code>${escapeHtml(event.line)}</code>
        </article>
    `).join("");
}

function buildTtLogMarkdownReport(scanResult) {
    if (!scanResult || scanResult.events.length === 0) {
        return "";
    }

    const summary = summarizeTtLogEvents(scanResult);
    const lines = [
        "# 天通日志诊断报告",
        "",
        "## 事件概览",
        "",
        `- 总行数：${summary.totalLines}`,
        `- 初筛行数：${summary.filteredLines}`,
        `- 命中事件：${summary.totalEvents}`,
        `- 原始命中：${summary.rawEventCount}`,
        `- 合并重复：${summary.duplicateCount}`,
        `- 风险/失败事件：${summary.warnings}`,
        "",
        "## 关键时间线",
        "",
    ];

    scanResult.events.forEach((event) => {
        lines.push(`- ${event.time} ${event.message}`);
        lines.push(`  - 行 ${event.lineNumber} | ${event.tag} | ${event.sourceLabel} | ${event.profileLabel} / ${event.category}${event.duplicateCount ? ` | 已合并重复 ${event.duplicateCount} 条` : ""}`);
        lines.push(`  - ${event.line}`);
    });

    lines.push("");
    lines.push("## 初步结论");
    lines.push("");
    if (summary.warnings > 0) {
        lines.push("- 日志中存在释放、失败或异常类事件，建议优先围绕上述风险事件前后 30 秒补充分析。");
    } else {
        lines.push("- 当前规则未识别到明确失败事件，需要结合业务现象继续扩展规则或补充日志。");
    }
    lines.push("");
    lines.push("## 建议补充日志");
    lines.push("");
    lines.push("- 若分析电话问题，补充 ATD、CLCC、DSCI、NO CARRIER、CREG、SATSIGNAL 前后完整片段。");
    lines.push("- 若分析语音问题，补充 AudioService、AudioManager、AudioFlinger、AudioFocus 和路由切换日志。");
    lines.push("- 若分析功耗问题，补充 screen state、wakelock、modem sleep timer、CP2AP_WAKEUP、suspend/resume 日志。");

    return lines.join("\n");
}

function releaseTtLogReportDownloadUrl() {
    if (ttLogReportDownloadUrl) {
        URL.revokeObjectURL(ttLogReportDownloadUrl);
        ttLogReportDownloadUrl = "";
    }
    releaseTtLogConfigDownloadUrl();
}

function downloadTtLogReport(report) {
    releaseTtLogReportDownloadUrl();
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    ttLogReportDownloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = ttLogReportDownloadUrl;
    link.download = "tt-log-diagnostic-report.md";
    link.click();
}

// ==================== 图表：时间解析与数据提取 ====================
function parseTimestampToMs(timeStr) {
    if (!timeStr) return 0;
    // Format: "MM-DD HH:MM:SS.mmm"
    var match = timeStr.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})\.?(\d{0,3})/);
    if (!match) return 0;
    var day = parseInt(match[1], 10);
    var hour = parseInt(match[3], 10);
    var min = parseInt(match[4], 10);
    var sec = parseInt(match[5], 10);
    var ms = parseInt((match[6] || "0").padEnd(3, "0"), 10);
    return ((day * 24 + hour) * 60 + min) * 60 * 1000 + sec * 1000 + ms;
}

function formatTimeTick(ms) {
    var totalSec = Math.floor(ms / 1000);
    var h = Math.floor(totalSec / 3600) % 24;
    var m = Math.floor((totalSec % 3600) / 60);
    var s = totalSec % 60;
    if (h > 0) {
        return h + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
    }
    return m + ":" + String(s).padStart(2, "0");
}

function extractCallPeriods(callSnapshots) {
    // callSnapshots: [{time, lineNumber, id, idr, stat, number, label}, ...]
    // Group by call id, find start (stat=2 or 4) and end (stat=6)
    var byId = {};
    callSnapshots.forEach(function (s) {
        if (!byId[s.id]) byId[s.id] = [];
        byId[s.id].push(s);
    });

    var periods = [];
    Object.keys(byId).forEach(function (key) {
        var events = byId[key];
        events.sort(function (a, b) { return a.lineNumber - b.lineNumber; });
        var start = null;
        var direction = events[0].idr === 1 ? "被叫" : "主叫";
        var number = events[0].number || "";

        for (var i = 0; i < events.length; i++) {
            var e = events[i];
            if (e.stat === 2 || e.stat === 4) {
                // dialing or incoming = call starts
                start = e;
            } else if (e.stat === 6 && start) {
                // terminated = call ends
                periods.push({
                    callId: parseInt(key, 10),
                    startTime: start.time,
                    endTime: e.time,
                    startMs: parseTimestampToMs(start.time),
                    endMs: parseTimestampToMs(e.time),
                    direction: direction,
                    number: number,
                });
                start = null;
            }
        }
        // Fallback: if call started but no termination, use last event as end
        if (start) {
            var last = events[events.length - 1];
            periods.push({
                callId: parseInt(key, 10),
                startTime: start.time,
                endTime: last.time,
                startMs: parseTimestampToMs(start.time),
                endMs: parseTimestampToMs(last.time),
                direction: direction,
                number: number,
            });
        }
    });

    periods.sort(function (a, b) { return a.startMs - b.startMs; });
    return periods;
}

function extractSmsMarkers(events) {
    // events: from scanResult.events or annotation result
    // Returns: [{time, type, number, text}]
    if (!events) return [];
    var markers = [];
    events.forEach(function (e) {
        // Check if it's an SMS-related event
        if (e.type === "sms" || e.category === "短信事件" || e.category === "短信入网") {
            markers.push({
                time: e.time,
                ms: parseTimestampToMs(e.time),
                text: e.message || e.category,
            });
        }
        // Also check annotations for SMS
        if (e.annotations) {
            e.annotations.forEach(function (ann) {
                if (ann.type === "sms" || ann.category === "短信事件") {
                    markers.push({
                        time: e.time,
                        ms: parseTimestampToMs(e.time),
                        text: ann.text,
                    });
                }
            });
        }
    });

    markers.sort(function (a, b) { return a.ms - b.ms; });
    // Deduplicate by time
    var deduped = [];
    markers.forEach(function (m) {
        if (deduped.length === 0 || deduped[deduped.length - 1].ms !== m.ms) {
            deduped.push(m);
        }
    });
    return deduped;
}

function computeYRange(values, padding) {
    if (values.length === 0) return { min: 0, max: 100, range: 100 };
    var min = Math.min.apply(null, values);
    var max = Math.max.apply(null, values);
    if (min === max) {
        min -= 10;
        max += 10;
    }
    var pad = padding || 5;
    min = Math.floor(min - pad);
    max = Math.ceil(max + pad);
    return { min: min, max: max, range: max - min };
}

function pickTimeTicks(minMs, maxMs, maxTicks) {
    maxTicks = maxTicks || 10;
    var range = maxMs - minMs;
    if (range <= 0) return [minMs];

    var step = range / maxTicks;
    // Round step to nice intervals: 1s, 5s, 10s, 30s, 1min, 5min, 10min, 30min
    var niceSteps = [1000, 5000, 10000, 30000, 60000, 300000, 600000, 1800000];
    var roundedStep = niceSteps[0];
    for (var i = 0; i < niceSteps.length; i++) {
        if (niceSteps[i] >= step) {
            roundedStep = niceSteps[i];
            break;
        }
    }

    var ticks = [];
    var t = Math.ceil(minMs / roundedStep) * roundedStep;
    while (t <= maxMs) {
        ticks.push(t);
        t += roundedStep;
    }
    return ticks;
}

// ==================== 进度条辅助 ====================
function showScanProgress() {
    var bar = document.getElementById("ttLogProgress");
    if (bar) { bar.value = 0; bar.style.display = "block"; }
}

function updateScanProgress(done, total) {
    var bar = document.getElementById("ttLogProgress");
    if (bar && total > 0) {
        bar.value = Math.min(Math.round(done / total * 100), 100);
    }
}

function hideScanProgress() {
    var bar = document.getElementById("ttLogProgress");
    if (bar) { bar.style.display = "none"; bar.value = 0; }
}

// ---- 分块异步扫描：避免大日志阻塞 UI ----
var SCAN_CHUNK_SIZE = 600;

function scanTtLogEventsAsync(text, options) {
    return new Promise(function (resolve) {
        var selectedProfiles = new Set(options.profiles);
        var sourceConfig = buildTtLogSourceConfig(options.sourceConfig || {});
        var rules = TT_LOG_RULES.filter(function (rule) { return selectedProfiles.has(rule.profile); });
        var lines = splitLogLines(text);
        var total = lines.length;
        var events = [];
        var filteredLines = 0;
        var chunkSize = SCAN_CHUNK_SIZE;

        function processChunk(startIdx) {
            var endIdx = Math.min(startIdx + chunkSize, total);
            for (var i = startIdx; i < endIdx; i++) {
                var line = lines[i];
                var parsed = parseTtLogLine(line, i + 1);
                var source = ttLogLineMatchesSource(parsed, sourceConfig);
                if (!source) continue;
                filteredLines++;

                for (var r = 0; r < rules.length; r++) {
                    var rule = rules[r];
                    if (sourceConfig.matchRealTagOnly && rule.profile === "tt_call" && source.kind === "helper") continue;
                    var matched = rule.match(line);
                    if (!matched) continue;
                    events.push({
                        line: parsed.line,
                        lineNumber: parsed.lineNumber,
                        time: parsed.time,
                        tag: parsed.tag,
                        profile: rule.profile,
                        profileLabel: TT_LOG_PROFILE_LABELS[rule.profile] || rule.profile,
                        type: rule.type,
                        category: rule.category,
                        message: matched.message,
                        fields: matched.fields || {},
                        severity: matched.severity || "info",
                        sourceKind: source.kind,
                        sourceLabel: source.label,
                    });
                }
            }

            updateScanProgress(endIdx, total);

            if (endIdx < total) {
                setTimeout(function () { processChunk(endIdx); }, 0);
            } else {
                var dedupeResult = sourceConfig.dedupeEnabled ? dedupeTtLogEvents(events) : { events: events, duplicateCount: 0 };
                resolve({
                    totalLines: total,
                    filteredLines: filteredLines,
                    profiles: [].concat([].slice.call(selectedProfiles)),
                    sourceConfig: sourceConfig,
                    events: dedupeResult.events,
                    rawEventCount: events.length,
                    duplicateCount: dedupeResult.duplicateCount,
                });
            }
        }

        showScanProgress();
        setTimeout(function () { processChunk(0); }, 10);
    });
}

function scanTtLogAnnotationsAsync(text, options) {
    return new Promise(function (resolve) {
        var sourceConfig = buildTtLogSourceConfig(options.sourceConfig || {});
        var lines = splitLogLines(text);
        var total = lines.length;
        var annotatedLines = [];
        var filteredLines = 0;
        var chunkSize = SCAN_CHUNK_SIZE;

        function processChunk(startIdx) {
            var endIdx = Math.min(startIdx + chunkSize, total);
            for (var i = startIdx; i < endIdx; i++) {
                var line = lines[i];
                var parsed = parseTtLogLine(line, i + 1);
                var source = ttLogLineMatchesSource(parsed, sourceConfig);
                if (!source) continue;
                filteredLines++;

                var annotations = [];
                for (var j = 0; j < TT_LOG_ANNOTATORS.length; j++) {
                    var result = TT_LOG_ANNOTATORS[j].match(line);
                    if (result && result.annotations) {
                        for (var k = 0; k < result.annotations.length; k++) {
                            annotations.push({
                                type: TT_LOG_ANNOTATORS[j].type,
                                category: TT_LOG_ANNOTATORS[j].category,
                                text: result.annotations[k].text,
                                severity: result.annotations[k].severity || "info",
                                fields: result.annotations[k].fields || {},
                            });
                        }
                    }
                }

                if (annotations.length > 0) {
                    annotatedLines.push({
                        lineNumber: parsed.lineNumber,
                        time: parsed.time,
                        tag: parsed.tag,
                        line: line,
                        sourceKind: source.kind,
                        sourceLabel: source.label,
                        annotations: annotations,
                    });
                }
            }

            updateScanProgress(endIdx, total);

            if (endIdx < total) {
                setTimeout(function () { processChunk(endIdx); }, 0);
            } else {
                var totalAnnotations = annotatedLines.reduce(function (sum, l) { return sum + l.annotations.length; }, 0);
                resolve({
                    totalLines: total,
                    filteredLines: filteredLines,
                    annotatedLines: annotatedLines,
                    annotationCount: totalAnnotations,
                    sourceConfig: sourceConfig,
                });
            }
        }

        showScanProgress();
        setTimeout(function () { processChunk(0); }, 10);
    });
}

// ==================== 逐行注解：核心扫描函数 ====================
function scanTtLogAnnotations(text, options) {
    var sourceConfig = buildTtLogSourceConfig(options.sourceConfig || {});
    var lines = splitLogLines(text);
    var annotatedLines = [];
    var filteredLines = 0;

    lines.forEach(function (line, index) {
        var parsed = parseTtLogLine(line, index + 1);
        var source = ttLogLineMatchesSource(parsed, sourceConfig);
        if (!source) return;
        filteredLines += 1;

        var annotations = [];
        for (var i = 0; i < TT_LOG_ANNOTATORS.length; i++) {
            var result = TT_LOG_ANNOTATORS[i].match(line);
            if (result && result.annotations) {
                for (var j = 0; j < result.annotations.length; j++) {
                    annotations.push({
                        type: TT_LOG_ANNOTATORS[i].type,
                        category: TT_LOG_ANNOTATORS[i].category,
                        text: result.annotations[j].text,
                        severity: result.annotations[j].severity || "info",
                        fields: result.annotations[j].fields || {},
                    });
                }
            }
        }

        if (annotations.length > 0) {
            annotatedLines.push({
                lineNumber: parsed.lineNumber,
                time: parsed.time,
                tag: parsed.tag,
                line: line,
                sourceKind: source.kind,
                sourceLabel: source.label,
                annotations: annotations,
            });
        }
    });

    var totalAnnotations = annotatedLines.reduce(function (sum, l) { return sum + l.annotations.length; }, 0);

    return {
        totalLines: lines.length,
        filteredLines: filteredLines,
        annotatedLines: annotatedLines,
        annotationCount: totalAnnotations,
        sourceConfig: sourceConfig,
    };
}

// ==================== 逐行注解：状态提取与汇总 ====================
function extractTtLogStateSnapshots(text) {
    var lines = splitLogLines(text);
    var snapshots = {};
    for (var i = 0; i < TT_LOG_STATE_TRACKERS.length; i++) {
        snapshots[TT_LOG_STATE_TRACKERS[i].id] = [];
    }

    lines.forEach(function (line, index) {
        for (var i = 0; i < TT_LOG_STATE_TRACKERS.length; i++) {
            var result = TT_LOG_STATE_TRACKERS[i].extract(line, index + 1);
            if (result) {
                snapshots[TT_LOG_STATE_TRACKERS[i].id].push(result);
            }
        }
    });

    return snapshots;
}

function summarizeTtLogStateChanges(snapshots) {
    var summaries = {};

    for (var i = 0; i < TT_LOG_STATE_TRACKERS.length; i++) {
        var tracker = TT_LOG_STATE_TRACKERS[i];
        var samples = snapshots[tracker.id] || [];

        if (samples.length === 0) {
            summaries[tracker.id] = { label: tracker.label, sampleCount: 0, empty: true };
            continue;
        }

        if (tracker.id === "signal") {
            var rssiVals = samples.map(function (s) { return s.rssi; });
            summaries[tracker.id] = {
                label: tracker.label,
                sampleCount: samples.length,
                first: samples[0],
                last: samples[samples.length - 1],
                rssiMin: Math.min.apply(null, rssiVals),
                rssiMax: Math.max.apply(null, rssiVals),
                rssiAvg: Math.round(rssiVals.reduce(function (a, b) { return a + b; }, 0) / rssiVals.length),
                trend: rssiVals[rssiVals.length - 1] - rssiVals[0],
                samples: samples,
            };
        } else if (tracker.id === "network") {
            var changes = [];
            var prev = null;
            for (var j = 0; j < samples.length; j++) {
                if (!prev || prev.state !== samples[j].state) {
                    changes.push(samples[j]);
                }
                prev = samples[j];
            }
            summaries[tracker.id] = {
                label: tracker.label,
                sampleCount: samples.length,
                changeCount: changes.length,
                currentState: samples[samples.length - 1],
                changes: changes,
            };
        } else if (tracker.id === "call") {
            summaries[tracker.id] = {
                label: tracker.label,
                sampleCount: samples.length,
                samples: samples,
            };
        } else {
            summaries[tracker.id] = {
                label: tracker.label,
                sampleCount: samples.length,
                empty: false,
            };
        }
    }

    return summaries;
}

// ==================== 逐行注解：渲染函数 ====================
function renderTtLogAnnotationSummary(annotationResult) {
    var container = document.getElementById("ttLogAnnotationSummary");
    if (!container) return;
    if (!annotationResult) {
        container.innerHTML = "";
        return;
    }

    var byCategory = {};
    annotationResult.annotatedLines.forEach(function (item) {
        item.annotations.forEach(function (ann) {
            byCategory[ann.category] = (byCategory[ann.category] || 0) + 1;
        });
    });

    var cards = [
        ["注解行数", annotationResult.annotatedLines.length],
        ["注解总数", annotationResult.annotationCount],
    ];
    Object.keys(byCategory).forEach(function (cat) {
        cards.push([cat, byCategory[cat]]);
    });

    container.innerHTML = cards.map(function (pair) {
        return '<div class="metric-card"><span>' + escapeHtml(pair[0]) + '</span><strong>' + escapeHtml(pair[1]) + '</strong></div>';
    }).join("");
}

function renderTtLogAnnotationList(annotationResult) {
    var container = document.getElementById("ttLogAnnotationList");
    if (!container) return;
    if (!annotationResult || annotationResult.annotatedLines.length === 0) {
        container.innerHTML = '<p class="panel-caption">暂无注解结果，请先执行注解。</p>';
        return;
    }

    container.innerHTML = annotationResult.annotatedLines.map(function (item) {
        var badges = item.annotations.map(function (ann) {
            return '<span class="annotation-badge annotation-' + escapeHtml(ann.severity) + '" title="' + escapeHtml(ann.category) + '">' + escapeHtml(ann.text) + '</span>';
        }).join("");

        return '<div class="annotation-item">' +
            '<div class="annotation-header">' +
            '<span class="annotation-line-number">' + item.lineNumber + '</span>' +
            '<span class="annotation-time">' + escapeHtml(item.time) + '</span>' +
            '<span class="annotation-tag">' + escapeHtml(item.tag) + '</span>' +
            '<span class="annotation-source">' + escapeHtml(item.sourceLabel) + '</span>' +
            '</div>' +
            '<div class="annotation-body">' +
            '<div class="annotation-badges">' + badges + '</div>' +
            '<details class="annotation-raw"><summary>原始日志</summary><code>' + escapeHtml(item.line) + '</code></details>' +
            '</div>' +
            '</div>';
    }).join("");
}

// ==================== 图表：Canvas 折线图渲染（含缩放/平移/悬停） ====================
function resetChartZoom(canvas) {
    if (canvas && canvas._chart) {
        canvas._chart.viewMin = null;
        canvas._chart.viewMax = null;
    }
}

var _chartTooltipHideTimer = 0;

function renderTtLogChart(scanState, text, options) {
    var canvas = document.getElementById("ttLogChart");
    if (!canvas) return;
    var container = canvas.parentElement;
    if (!container) return;
    var tooltip = document.getElementById("ttChartTooltip");

    var opts = options || {};
    var showCall = opts.showCall !== false;
    var showSms = opts.showSms !== false;

    // ---- 数据：优先从已有 chart state 复用，否则重新提取 ----
    var prevCh = canvas._chart;
    var signalSamples, callPeriods, smsMarkers, tMin, tMax;

    if (prevCh && prevCh.signalSamples && text === null) {
        // 缩放/平移回调：复用已存储数据
        signalSamples = prevCh.signalSamples;
        callPeriods = showCall ? prevCh.callPeriods : [];
        smsMarkers = showSms ? (prevCh.smsMarkers || []) : [];
        tMin = prevCh.tMin;
        tMax = prevCh.tMax;
    } else {
        // 初次或刷新：重新提取
        var snapshots = text ? extractTtLogStateSnapshots(text) : { signal: [], call: [], network: [] };
        signalSamples = (snapshots.signal || []).filter(function (s) { return s.rssi !== undefined && s.snr !== undefined; });
        callPeriods = showCall ? extractCallPeriods(snapshots.call || []) : [];
        smsMarkers = showSms ? extractSmsMarkers(scanState ? scanState.events : []) : [];

        var allTimes = [];
        signalSamples.forEach(function (s) {
            var ms = parseTimestampToMs(s.time);
            if (ms > 0) allTimes.push(Math.floor(ms));
        });
        callPeriods.forEach(function (p) {
            if (p.startMs > 0) allTimes.push(p.startMs);
            if (p.endMs > 0) allTimes.push(p.endMs);
        });
        smsMarkers.forEach(function (m) {
            if (m.ms > 0) allTimes.push(m.ms);
        });

        tMin = allTimes.length > 0 ? Math.min.apply(null, allTimes) : 0;
        tMax = allTimes.length > 0 ? Math.max.apply(null, allTimes) : tMin + 60000;
        if (tMax === tMin) tMax = tMin + 60000;

        // 重置 zoom 到全范围
        prevCh = {};
    }

    // Check if we have any data
    if (signalSamples.length === 0 && callPeriods.length === 0) {
        var ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue("--muted").trim() || "#94a3b8";
        ctx.font = "14px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("暂无信号数据可用 (^SATSIGNAL)", canvas.width / 2, canvas.height / 2);
        canvas._chart = null;
        return;
    }

    // ---- 存储数据到 canvas 供事件处理使用 ----
    var ch = prevCh;
    ch.tMin = tMin;
    ch.tMax = tMax;
    ch.signalSamples = signalSamples;
    ch.callPeriods = callPeriods;
    ch.smsMarkers = smsMarkers;
    ch.showCall = showCall;
    ch.showSms = showSms;

    // ---- Zoom state (persisted) ----
    if (ch.viewMin == null || ch.viewMax == null) {
        ch.viewMin = tMin;
        ch.viewMax = tMax;
    }
    // Clamp view to data range
    if (ch.viewMin < tMin) ch.viewMin = tMin;
    if (ch.viewMax > tMax) ch.viewMax = tMax;
    var viewMin = ch.viewMin;
    var viewMax = ch.viewMax;
    var viewRange = viewMax - viewMin;
    if (viewRange <= 0) { viewRange = 60000; viewMax = viewMin + 60000; }

    canvas._chart = ch;

    // ---- RSSI / SNR 范围 ----
    var rssiVals = signalSamples.map(function (s) { return s.rssi; });
    var snrVals = signalSamples.map(function (s) { return s.snr; });
    var rssiRange = computeYRange(rssiVals, 5);
    var snrRange = computeYRange(snrVals, 3);

    // ---- Canvas 尺寸 ----
    var dpr = window.devicePixelRatio || 1;
    var rect = container.getBoundingClientRect();
    var w = rect.width;
    var h = Math.max(w * 0.5, 350);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    canvas.width = w * dpr;
    canvas.height = h * dpr;

    var ctx = canvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    // ---- 边距 ----
    var margin = { top: 20, right: 60, bottom: 40, left: 52 };
    var plotW = w - margin.left - margin.right;
    var plotH = h - margin.top - margin.bottom;
    ch.margin = margin;
    ch.plotW = plotW;
    ch.plotH = plotH;
    ch.w = w;
    ch.h = h;
    ch.rssiRange = rssiRange;
    ch.snrRange = snrRange;

    // ---- 坐标映射（基于 view 范围） ----
    function timeToX(ms) { return margin.left + (ms - viewMin) / viewRange * plotW; }
    function xToTime(x) { return viewMin + (x - margin.left) / plotW * viewRange; }
    function rssiToY(rssi) { return margin.top + (rssiRange.max - rssi) / rssiRange.range * plotH; }
    function snrToY(snr) { return margin.top + (snrRange.max - snr) / snrRange.range * plotH; }
    ch.timeToX = timeToX;
    ch.xToTime = xToTime;
    ch.rssiToY = rssiToY;
    ch.snrToY = snrToY;

    // ---- 样式 ----
    var style = getComputedStyle(document.body);
    var bgColor = style.getPropertyValue("--bg-main") || style.getPropertyValue("--bg") || "#ffffff";
    var textColor = style.getPropertyValue("--muted") || "#94a3b8";
    var borderColor = style.getPropertyValue("--border") || "#e2e8f0";
    var accentColor = style.getPropertyValue("--accent") || "#2563eb";
    ch.accentColor = accentColor;

    // ---- 1. 背景 ----
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, w, h);

    // ---- 2. 裁剪区域（绘图区） ----
    ctx.save();
    ctx.beginPath();
    ctx.rect(margin.left, margin.top, plotW, plotH);
    ctx.clip();

    // ---- 3. 通话时段色块 ----
    if (showCall && callPeriods.length > 0) {
        callPeriods.forEach(function (p) {
            if (p.startMs >= viewMax || p.endMs <= viewMin) return;
            var x1 = timeToX(Math.max(p.startMs, viewMin));
            var x2 = timeToX(Math.min(p.endMs, viewMax));
            var isOutgoing = p.direction === "主叫";
            ctx.fillStyle = isOutgoing ? "rgba(37, 99, 235, 0.10)" : "rgba(22, 163, 74, 0.10)";
            ctx.fillRect(x1, margin.top, x2 - x1, plotH);

            if (x2 - x1 > 40) {
                ctx.fillStyle = isOutgoing ? "rgba(37, 99, 235, 0.35)" : "rgba(22, 163, 74, 0.35)";
                ctx.font = "11px system-ui, sans-serif";
                ctx.textAlign = "center";
                var label = p.direction + (p.number ? " " + p.number : "");
                ctx.fillText(label, (x1 + x2) / 2, margin.top + 14);
            }
        });
    }

    // ---- 4. SMS 事件标记 ----
    if (showSms && smsMarkers.length > 0) {
        smsMarkers.forEach(function (m) {
            if (m.ms < viewMin || m.ms > viewMax) return;
            var x = timeToX(m.ms);
            ctx.strokeStyle = "#d97706";
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 3]);
            ctx.beginPath();
            ctx.moveTo(x, margin.top);
            ctx.lineTo(x, margin.top + plotH);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = "#d97706";
            ctx.font = "10px system-ui, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("SMS", x, margin.top + plotH - 4);
        });
    }

    // ---- 5. RSSI 折线 ----
    if (rssiVals.length > 0) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        var firstRssi = true;
        signalSamples.forEach(function (s) {
            var ms = parseTimestampToMs(s.time);
            if (ms <= 0) return;
            var x = timeToX(ms);
            var y = rssiToY(s.rssi);
            if (firstRssi) { ctx.moveTo(x, y); firstRssi = false; }
            else { ctx.lineTo(x, y); }
        });
        ctx.stroke();

        if (signalSamples.length <= 500) {
            ctx.fillStyle = accentColor;
            signalSamples.forEach(function (s) {
                var ms = parseTimestampToMs(s.time);
                if (ms <= 0) return;
                var x = timeToX(ms);
                var y = rssiToY(s.rssi);
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    // ---- 6. SNR 折线 ----
    if (snrVals.length > 0) {
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = 2;
        ctx.lineJoin = "round";
        ctx.beginPath();
        var firstSnr = true;
        signalSamples.forEach(function (s) {
            var ms = parseTimestampToMs(s.time);
            if (ms <= 0) return;
            var x = timeToX(ms);
            var y = snrToY(s.snr);
            if (firstSnr) { ctx.moveTo(x, y); firstSnr = false; }
            else { ctx.lineTo(x, y); }
        });
        ctx.stroke();

        if (signalSamples.length <= 500) {
            ctx.fillStyle = "#16a34a";
            signalSamples.forEach(function (s) {
                var ms = parseTimestampToMs(s.time);
                if (ms <= 0) return;
                var x = timeToX(ms);
                var y = snrToY(s.snr);
                ctx.beginPath();
                ctx.arc(x, y, 2.5, 0, Math.PI * 2);
                ctx.fill();
            });
        }
    }

    ctx.restore(); // 结束裁剪

    // ---- 7. Y 轴标签（左 RSSI / 右 SNR） ----
    ctx.fillStyle = textColor;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "right";
    var rssiTicks = 5;
    for (var i = 0; i <= rssiTicks; i++) {
        var val = rssiRange.max - (rssiRange.range / rssiTicks) * i;
        var y = margin.top + (plotH / rssiTicks) * i;
        ctx.fillText(Math.round(val) + " dBm", margin.left - 6, y + 4);
    }

    var snrTicks = 4;
    ctx.textAlign = "left";
    for (var i = 0; i <= snrTicks; i++) {
        var val = snrRange.max - (snrRange.range / snrTicks) * i;
        var y = margin.top + (plotH / snrTicks) * i;
        ctx.fillText(Math.round(val) + " dB", margin.left + plotW + 6, y + 4);
    }

    // ---- 8. X 轴时间标签 ----
    var timeTicks = pickTimeTicks(viewMin, viewMax, 8);
    ctx.fillStyle = textColor;
    ctx.font = "10px system-ui, sans-serif";
    ctx.textAlign = "center";
    timeTicks.forEach(function (tick) {
        var x = timeToX(tick);
        ctx.fillText(formatTimeTick(tick - tMin), x, h - 6);
    });

    // ---- 9. Y 轴标题 ----
    ctx.save();
    ctx.fillStyle = accentColor;
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.translate(12, margin.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("RSSI", 0, 0);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = "#16a34a";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.translate(w - 12, margin.top + plotH / 2);
    ctx.rotate(Math.PI / 2);
    ctx.fillText("SNR", 0, 0);
    ctx.restore();

    // ---- 10. 图例 ----
    var legendX = margin.left + 8;
    var legendY = margin.top + 4;
    ctx.fillStyle = accentColor;
    ctx.fillRect(legendX, legendY, 14, 3);
    ctx.fillStyle = textColor;
    ctx.font = "11px system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("RSSI (dBm)", legendX + 18, legendY + 5);
    ctx.fillStyle = "#16a34a";
    ctx.fillRect(legendX + 100, legendY, 14, 3);
    ctx.fillText("SNR (dB)", legendX + 118, legendY + 5);

    if (showCall && callPeriods.length > 0) {
        ctx.fillStyle = "rgba(37, 99, 235, 0.25)";
        ctx.fillRect(legendX + 210, legendY - 3, 14, 12);
        ctx.fillStyle = textColor;
        ctx.fillText("主叫", legendX + 228, legendY + 5);
        ctx.fillStyle = "rgba(22, 163, 74, 0.25)";
        ctx.fillRect(legendX + 264, legendY - 3, 14, 12);
        ctx.fillText("被叫", legendX + 282, legendY + 5);
    }

    if (showSms && smsMarkers.length > 0) {
        ctx.strokeStyle = "#d97706";
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(legendX + 328, legendY + 3);
        ctx.lineTo(legendX + 342, legendY + 3);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = textColor;
        ctx.fillText("短信", legendX + 346, legendY + 5);
    }

    // ---- 11. 缩放提示 ----
    if (viewRange < (tMax - tMin) * 0.99 || viewMin > tMin) {
        ctx.fillStyle = textColor;
        ctx.font = "10px system-ui, sans-serif";
        ctx.textAlign = "right";
        ctx.fillText("滚轮缩放 | 拖拽平移 | 双击重置", w - 8, h - 6);
    }

    // ---- 12. 鼠标事件（首次绑定时设置） ----
    if (!canvas._eventsBound) {
        canvas._eventsBound = true;

        canvas.addEventListener("wheel", function (e) {
            e.preventDefault();
            var ch = canvas._chart;
            if (!ch) return;
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var factor = e.deltaY < 0 ? 0.85 : 1.18;
            var t = ch.xToTime(mx);
            var newRange = (ch.viewMax - ch.viewMin) * factor;
            var ratio = (t - ch.viewMin) / (ch.viewMax - ch.viewMin);
            ch.viewMin = t - newRange * ratio;
            ch.viewMax = t + newRange * (1 - ratio);
            if (ch.viewMin < ch.tMin) ch.viewMin = ch.tMin;
            if (ch.viewMax > ch.tMax) ch.viewMax = ch.tMax;
            if (ch.viewMax - ch.viewMin < 2000) { ch.viewMax = ch.viewMin + 2000; }
            renderTtLogChart(null, null, { showCall: ch.showCall, showSms: ch.showSms });
        }, { passive: false });

        var dragging = false;
        var dragStartX = 0;
        var dragStartViewMin = 0;
        var dragStartViewMax = 0;

        canvas.addEventListener("mousedown", function (e) {
            var ch = canvas._chart;
            if (!ch) return;
            dragging = true;
            dragStartX = e.clientX;
            dragStartViewMin = ch.viewMin;
            dragStartViewMax = ch.viewMax;
            canvas.style.cursor = "grabbing";
        });

        window.addEventListener("mousemove", function (e) {
            var ch = canvas._chart;
            if (!ch) return;

            if (dragging) {
                var rect = canvas.getBoundingClientRect();
                var dx = e.clientX - dragStartX;
                var scale = (ch.viewMax - ch.viewMin) / ch.plotW;
                var dt = -dx * scale;
                ch.viewMin = dragStartViewMin + dt;
                ch.viewMax = dragStartViewMax + dt;
                if (ch.viewMin < ch.tMin) { var shift = ch.tMin - ch.viewMin; ch.viewMin += shift; ch.viewMax += shift; }
                if (ch.viewMax > ch.tMax) { var shift = ch.viewMax - ch.tMax; ch.viewMin -= shift; ch.viewMax -= shift; }
                if (ch.viewMin < ch.tMin) ch.viewMin = ch.tMin;
                renderTtLogChart(null, null, { showCall: ch.showCall, showSms: ch.showSms });
                return;
            }

            // ---- Tooltip logic ----
            if (!tooltip) return;
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            if (mx < ch.margin.left || mx > ch.margin.left + ch.plotW || my < ch.margin.top || my > ch.margin.top + ch.plotH) {
                tooltip.style.display = "none";
                canvas.style.cursor = "";
                return;
            }

            var t = ch.xToTime(mx);
            var tooltipHtml = "";

            // Check call periods
            if (ch.showCall && ch.callPeriods) {
                for (var i = 0; i < ch.callPeriods.length; i++) {
                    var p = ch.callPeriods[i];
                    if (t >= p.startMs && t <= p.endMs) {
                        tooltipHtml = '<strong>' + p.direction + '</strong>' + (p.number ? ' ' + escapeHtml(p.number) : '') +
                            '<br>开始: ' + escapeHtml(p.startTime) +
                            '<br>结束: ' + escapeHtml(p.endTime);
                        canvas.style.cursor = "pointer";
                        break;
                    }
                }
            }

            // Check SMS markers
            if (!tooltipHtml && ch.showSms && ch.smsMarkers) {
                for (var j = 0; j < ch.smsMarkers.length; j++) {
                    var m = ch.smsMarkers[j];
                    var mx2 = ch.timeToX(m.ms);
                    if (Math.abs(mx - mx2) < 8) {
                        tooltipHtml = '<strong>短信事件</strong><br>' + escapeHtml(m.text) + '<br>' + escapeHtml(m.time);
                        canvas.style.cursor = "pointer";
                        break;
                    }
                }
            }

            // Check signal samples
            if (!tooltipHtml && ch.signalSamples) {
                var closest = null;
                var closestDist = 12;
                for (var k = 0; k < ch.signalSamples.length; k++) {
                    var s = ch.signalSamples[k];
                    var sx = ch.timeToX(parseTimestampToMs(s.time));
                    if (Math.abs(mx - sx) < closestDist) {
                        closestDist = Math.abs(mx - sx);
                        closest = s;
                    }
                }
                if (closest) {
                    tooltipHtml = '<strong>信号</strong><br>RSSI: ' + closest.rssi + ' dBm (' + interpretRssi(closest.rssi) +
                        ')<br>SNR: ' + closest.snr + ' dB (' + interpretSnr(closest.snr) +
                        ')<br>' + escapeHtml(closest.time);
                    canvas.style.cursor = "crosshair";
                }
            }

            if (tooltipHtml) {
                tooltip.innerHTML = tooltipHtml;
                tooltip.style.display = "block";
                var tipX = e.clientX + 16;
                var tipY = e.clientY - 10;
                if (tipX + 220 > window.innerWidth) tipX = e.clientX - 226;
                if (tipY + 120 > window.innerHeight) tipY = e.clientY - 130;
                tooltip.style.left = tipX + "px";
                tooltip.style.top = tipY + "px";
            } else {
                tooltip.style.display = "none";
                canvas.style.cursor = "";
            }
        });

        window.addEventListener("mouseup", function () {
            if (dragging) {
                dragging = false;
                canvas.style.cursor = "";
            }
        });

        canvas.addEventListener("dblclick", function () {
            resetChartZoom(canvas);
            var ch = canvas._chart;
            if (ch) {
                renderTtLogChart(null, null, { showCall: ch.showCall, showSms: ch.showSms });
            }
        });

        // Hide tooltip when leaving canvas
        canvas.addEventListener("mouseleave", function () {
            if (tooltip) tooltip.style.display = "none";
            dragging = false;
            canvas.style.cursor = "";
        });
    }
}

function renderTtLogStatePanel(annotationResult, text) {
    var container = document.getElementById("ttLogStatePanel");
    if (!container) return;

    if (!text) {
        container.innerHTML = "";
        return;
    }

    var snapshots = extractTtLogStateSnapshots(text);
    var summaries = summarizeTtLogStateChanges(snapshots);

    var html = "";

    // Signal summary
    var signalSummary = summaries.signal;
    if (signalSummary && !signalSummary.empty) {
        html += '<div class="state-section"><h3>信号强度追踪 (' + signalSummary.sampleCount + ' 次采样)</h3>';
        html += '<dl class="protocol-list">';
        html += '<dt>RSSI 范围</dt><dd>' + signalSummary.rssiMin + ' ~ ' + signalSummary.rssiMax + ' dBm</dd>';
        html += '<dt>RSSI 平均</dt><dd>' + signalSummary.rssiAvg + ' dBm</dd>';
        html += '<dt>趋势</dt><dd>' + (signalSummary.trend > 0 ? '信号增强 (改善)' : signalSummary.trend < 0 ? '信号减弱 (恶化)' : '基本稳定') + '</dd>';
        html += '</dl>';
        html += '<div class="state-samples">';
        var displaySamples = signalSummary.samples.slice(0, 20);
        displaySamples.forEach(function (s) {
            var cls = s.rssi >= -85 ? "good" : s.rssi >= -100 ? "weak" : "poor";
            html += '<span class="state-sample state-sample-' + cls + '">' + escapeHtml(s.time) + ' RSSI=' + s.rssi + ' SNR=' + s.snr + '</span>';
        });
        if (signalSummary.samples.length > 20) {
            html += '<span class="state-sample-more">... 还有 ' + (signalSummary.samples.length - 20) + ' 次采样</span>';
        }
        html += '</div></div>';
    } else {
        html += '<div class="state-section"><p>未采集到信号数据 (^SATSIGNAL)。</p></div>';
    }

    // Network state changes
    var netSummary = summaries.network;
    if (netSummary && !netSummary.empty) {
        html += '<div class="state-section"><h3>网络注册状态变化 (' + netSummary.changeCount + ' 次变化)</h3>';
        netSummary.changes.forEach(function (c) {
            html += '<span class="state-change">' + escapeHtml(c.time) + ' 行' + c.lineNumber + ': ' + escapeHtml(c.label) + '</span>';
        });
        html += '</div>';
    } else {
        html += '<div class="state-section"><p>未采集到网络状态变化 (+CREG)。</p></div>';
    }

    // Call state changes
    var callSummary = summaries.call;
    if (callSummary && !callSummary.empty) {
        html += '<div class="state-section"><h3>通话状态变化 (' + callSummary.sampleCount + ' 次事件)</h3>';
        callSummary.samples.slice(0, 30).forEach(function (c) {
            html += '<span class="state-change">' + escapeHtml(c.time) + ' 行' + c.lineNumber + ': ' + escapeHtml(c.label) + '</span>';
        });
        if (callSummary.samples.length > 30) {
            html += '<span class="state-sample-more">... 还有 ' + (callSummary.samples.length - 30) + ' 次事件</span>';
        }
        html += '</div>';
    }

    container.innerHTML = html;
}

function getSelectedTtLogProfiles() {
    return [...document.querySelectorAll('input[name="ttLogProfile"]:checked')].map((input) => input.value);
}

function attachTtLogDiagnostic() {
    const fileInput = document.getElementById("ttLogFile");
    const presetSelect = document.getElementById("ttLogPresetSelect");
    const atTagsInput = document.getElementById("ttLogAtTags");
    const rilTagsInput = document.getElementById("ttLogRilTags");
    const helperKeywordsInput = document.getElementById("ttLogHelperKeywords");
    const matchRealTagOnlyInput = document.getElementById("ttLogMatchRealTagOnly");
    const dedupeEnabledInput = document.getElementById("ttLogDedupeEnabled");
    const scanBtn = document.getElementById("scanTtLogBtn");
    const reportBtn = document.getElementById("buildTtLogReportBtn");
    const copyBtn = document.getElementById("copyTtLogReportBtn");
    const downloadBtn = document.getElementById("downloadTtLogReportBtn");
    const exportConfigBtn = document.getElementById("exportTtLogConfigBtn");
    const importConfigBtn = document.getElementById("importTtLogConfigBtn");
    const configFileInput = document.getElementById("ttLogConfigFile");
    const clearBtn = document.getElementById("clearTtLogBtn");
    const reportBox = document.getElementById("ttLogReport");
    const statusId = "ttLogStatus";
    let scanState = null;
    let annotationState = null;
    var chartText = null;

    var getChartOptions = function () {
        var showCallCb = document.getElementById("ttChartShowCall");
        var showSmsCb = document.getElementById("ttChartShowSms");
        return {
            showCall: showCallCb ? showCallCb.checked : true,
            showSms: showSmsCb ? showSmsCb.checked : true,
        };
    };

    var redrawChart = function () {
        if (chartText && scanState) {
            renderTtLogChart(scanState, chartText, getChartOptions());
        }
    };

    if (!fileInput || !presetSelect || !atTagsInput || !rilTagsInput || !helperKeywordsInput ||
        !matchRealTagOnlyInput || !dedupeEnabledInput || !scanBtn || !reportBtn || !copyBtn ||
        !downloadBtn || !exportConfigBtn || !importConfigBtn || !configFileInput || !clearBtn || !reportBox) {
        return;
    }

    // ---- 拖拽上传 ----
    var dropZone = document.getElementById("ttLogDropZone");
    var fileNameDisplay = document.getElementById("ttLogFileName");
    if (dropZone && fileNameDisplay) {
        // 全局阻止浏览器默认拖拽行为（否则浏览器会直接打开文件）
        document.addEventListener("dragover", function (e) { e.preventDefault(); });
        document.addEventListener("drop", function (e) { e.preventDefault(); });

        dropZone.addEventListener("click", function () { fileInput.click(); });

        dropZone.addEventListener("dragenter", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add("is-dragover");
        });
        dropZone.addEventListener("dragover", function (e) {
            e.preventDefault();
            e.stopPropagation();
        });
        dropZone.addEventListener("dragleave", function (e) {
            // 只在真正离开 dropZone 时移除高亮（避免子元素触发）
            if (!dropZone.contains(e.relatedTarget)) {
                dropZone.classList.remove("is-dragover");
            }
        });
        dropZone.addEventListener("drop", function (e) {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove("is-dragover");
            var files = e.dataTransfer.files;
            if (files && files.length > 0) {
                fileInput.files = files;
                fileNameDisplay.textContent = files[0].name;
                resetView();
                setStatus("", "info", statusId);
            }
        });
        fileInput.addEventListener("change", function () {
            var file = fileInput.files?.[0];
            fileNameDisplay.textContent = file ? file.name : "";
            resetView();
            setStatus("", "info", statusId);
        });
    }

    const applySourcePreset = (presetId) => {
        const preset = TT_LOG_SOURCE_PRESETS[presetId] ?? TT_LOG_SOURCE_PRESETS.tt_default;
        atTagsInput.value = preset.atTags;
        rilTagsInput.value = preset.rilTags;
        helperKeywordsInput.value = preset.helperKeywords;
        matchRealTagOnlyInput.checked = preset.matchRealTagOnly;
        dedupeEnabledInput.checked = preset.dedupeEnabled;
    };

    const applySourceConfig = (config) => {
        presetSelect.value = TT_LOG_SOURCE_PRESETS[config.preset] ? config.preset : "custom";
        atTagsInput.value = config.atTags ?? TT_LOG_SOURCE_PRESETS.tt_default.atTags;
        rilTagsInput.value = config.rilTags ?? TT_LOG_SOURCE_PRESETS.tt_default.rilTags;
        helperKeywordsInput.value = config.helperKeywords ?? TT_LOG_SOURCE_PRESETS.tt_default.helperKeywords;
        matchRealTagOnlyInput.checked = config.matchRealTagOnly !== false;
        dedupeEnabledInput.checked = config.dedupeEnabled !== false;
    };

    const getSourceConfigFromInputs = () => buildTtLogSourceConfig({
        preset: presetSelect.value,
        atTags: atTagsInput.value,
        rilTags: rilTagsInput.value,
        helperKeywords: helperKeywordsInput.value,
        matchRealTagOnly: matchRealTagOnlyInput.checked,
        dedupeEnabled: dedupeEnabledInput.checked,
    });

    const getRawSourceConfigFromInputs = () => ({
        preset: presetSelect.value,
        atTags: atTagsInput.value,
        rilTags: rilTagsInput.value,
        helperKeywords: helperKeywordsInput.value,
        matchRealTagOnly: matchRealTagOnlyInput.checked,
        dedupeEnabled: dedupeEnabledInput.checked,
    });

    const readSelectedFileText = async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            setStatus("请先选择 txt/log 日志文件。", "error", statusId);
            return null;
        }
        if (!/\.(txt|log)$/i.test(file.name)) {
            setStatus("当前只处理 txt 或 log 日志文件。", "error", statusId);
            return null;
        }
        return file.text();
    };

    const resetView = () => {
        scanState = null;
        annotationState = null;
        chartText = null;
        reportBox.value = "";
        renderTtLogSummary(null);
        renderTtLogAnnotationSummary(null);
        renderTtLogAnnotationList(null);
        renderTtLogStatePanel(null, null);
        var chartCanvas = document.getElementById("ttLogChart");
        if (chartCanvas) {
            var ctx = chartCanvas.getContext("2d");
            ctx.clearRect(0, 0, chartCanvas.width, chartCanvas.height);
        }
        releaseTtLogReportDownloadUrl();
    };

    scanBtn.addEventListener("click", async () => {
        const profiles = getSelectedTtLogProfiles();
        if (profiles.length === 0) {
            setStatus("请至少选择一个分析场景。", "error", statusId);
            return;
        }

        const text = await readSelectedFileText();
        if (text === null) return;

        try {
            setStatus("正在扫描关键事件...", "info", statusId);
            const sourceConfig = getSourceConfigFromInputs();
            saveTtLogSourceConfig(getRawSourceConfigFromInputs());
            scanState = await scanTtLogEventsAsync(text, {
                profiles,
                sourceConfig,
            });
            hideScanProgress();
            chartText = text;
            renderTtLogSummary(scanState);
            renderTtLogChart(scanState, text, getChartOptions());
            reportBox.value = "";
            setStatus(`扫描完成：原始 ${scanState.totalLines} 行，初筛 ${scanState.filteredLines} 行，命中 ${scanState.events.length} 个关键事件。`, scanState.events.length ? "success" : "info", statusId);
        } catch (error) {
            hideScanProgress();
            resetView();
            setStatus(error.message, "error", statusId);
        }
    });

    reportBtn.addEventListener("click", () => {
        if (!scanState || scanState.events.length === 0) {
            setStatus("请先扫描并命中关键事件。", "error", statusId);
            return;
        }
        reportBox.value = buildTtLogMarkdownReport(scanState);
        setStatus("报告已生成。", "success", statusId);
    });

    copyBtn.addEventListener("click", async () => {
        if (!reportBox.value) {
            setStatus("请先生成报告。", "error", statusId);
            return;
        }
        try {
            await navigator.clipboard.writeText(reportBox.value);
            setStatus("报告已复制到剪贴板。", "success", statusId);
        } catch (error) {
            setStatus("浏览器未允许访问剪贴板。", "error", statusId);
        }
    });

    downloadBtn.addEventListener("click", () => {
        if (!reportBox.value) {
            setStatus("请先生成报告。", "error", statusId);
            return;
        }
        downloadTtLogReport(reportBox.value);
        setStatus("报告下载已触发。", "success", statusId);
    });

    exportConfigBtn.addEventListener("click", () => {
        const config = getRawSourceConfigFromInputs();
        saveTtLogSourceConfig(config);
        exportTtLogSourceConfigFile(config);
        setStatus("配置导出已触发。", "success", statusId);
    });

    importConfigBtn.addEventListener("click", () => {
        configFileInput.value = "";
        configFileInput.click();
    });

    configFileInput.addEventListener("change", async () => {
        const file = configFileInput.files?.[0];
        if (!file) {
            return;
        }

        try {
            const config = await importTtLogSourceConfigFile(file);
            applySourceConfig(config);
            saveTtLogSourceConfig(config);
            resetView();
            setStatus("配置已导入。", "success", statusId);
        } catch (error) {
            setStatus(error.message, "error", statusId);
        }
    });

    var annotateBtn = document.getElementById("annotateTtLogBtn");
    if (annotateBtn) {
        annotateBtn.addEventListener("click", async () => {
            var text = await readSelectedFileText();
            if (text === null) return;

            try {
                setStatus("正在执行逐行注解...", "info", statusId);
                var sourceConfig = getSourceConfigFromInputs();
                saveTtLogSourceConfig(getRawSourceConfigFromInputs());
                annotationState = await scanTtLogAnnotationsAsync(text, { sourceConfig: sourceConfig });
                hideScanProgress();
                renderTtLogAnnotationSummary(annotationState);
                renderTtLogAnnotationList(annotationState);
                renderTtLogStatePanel(annotationState, text);
                setStatus("注解完成：" + annotationState.annotatedLines.length + " 行匹配，共 " + annotationState.annotationCount + " 条注解。", "success", statusId);
            } catch (error) {
                hideScanProgress();
                annotationState = null;
                renderTtLogAnnotationSummary(null);
                renderTtLogAnnotationList(null);
                renderTtLogStatePanel(null, null);
                setStatus(error.message, "error", statusId);
            }
        });
    }

    clearBtn.addEventListener("click", () => {
        fileInput.value = "";
        var fd = document.getElementById("ttLogFileName");
        if (fd) fd.textContent = "";
        presetSelect.value = "tt_default";
        applySourcePreset("tt_default");
        saveTtLogSourceConfig({
            preset: "tt_default",
            ...TT_LOG_SOURCE_PRESETS.tt_default,
        });
        document.querySelectorAll('input[name="ttLogProfile"]').forEach((input) => {
            input.checked = input.value === "tt_call";
        });
        resetView();
        setStatus("", "info", statusId);
    });

    presetSelect.addEventListener("change", () => {
        if (presetSelect.value !== "custom") {
            applySourcePreset(presetSelect.value);
        }
        resetView();
        setStatus("", "info", statusId);
    });

    [fileInput, atTagsInput, rilTagsInput, helperKeywordsInput, matchRealTagOnlyInput,
        dedupeEnabledInput, ...document.querySelectorAll('input[name="ttLogProfile"]')].forEach((input) => {
        input.addEventListener("input", () => {
            if (input !== fileInput) {
                presetSelect.value = "custom";
            }
            resetView();
            setStatus("", "info", statusId);
        });
        input.addEventListener("change", () => {
            if (input !== fileInput) {
                presetSelect.value = "custom";
            }
            resetView();
            setStatus("", "info", statusId);
        });
    });

    // ---- 图表复选框 ----
    var chartShowCallCb = document.getElementById("ttChartShowCall");
    var chartShowSmsCb = document.getElementById("ttChartShowSms");
    if (chartShowCallCb) {
        chartShowCallCb.addEventListener("change", function () { redrawChart(); });
    }
    if (chartShowSmsCb) {
        chartShowSmsCb.addEventListener("change", function () { redrawChart(); });
    }
    var resetZoomBtn = document.getElementById("ttChartResetZoom");
    if (resetZoomBtn) {
        resetZoomBtn.addEventListener("click", function () {
            var canvas = document.getElementById("ttLogChart");
            if (canvas) {
                resetChartZoom(canvas);
                redrawChart();
            }
        });
    }

    applySourceConfig(loadTtLogSourceConfig());
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
    attachAudioPcmParser();
    attachTtLogDiagnostic();
    initToolShell();
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
function parseIpv4Address(value, label) {
    const parts = value.trim().split(".");
    if (parts.length !== 4) {
        throw new Error(`${label} 格式不正确，请输入类似 192.168.1.1 的 IPv4 地址。`);
    }

    return parts.map((part) => {
        if (!/^\d+$/.test(part)) {
            throw new Error(`${label} 包含非数字字段。`);
        }
        const number = Number(part);
        if (!Number.isInteger(number) || number < 0 || number > 255) {
            throw new Error(`${label} 每段必须在 0-255 范围内。`);
        }
        return number;
    });
}

function calculateIpv4HeaderChecksum(headerBytes) {
    const bytes = [...headerBytes];
    bytes[10] = 0;
    bytes[11] = 0;
    let sum = 0;
    for (let i = 0; i < bytes.length; i += 2) {
        sum += (bytes[i] << 8) | bytes[i + 1];
    }
    while (sum >>> 16) {
        sum = (sum & 0xffff) + (sum >>> 16);
    }
    return (~sum) & 0xffff;
}

function parseDecimalByte(value, label) {
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
        throw new Error(`${label} 必须为十进制数字。`);
    }
    const parsed = Number(normalized);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`${label} 超出 0-255 范围。`);
    }
    return parsed;
}

function buildIpv4Packet({ sourceIp, destIp, protocol, ttl, payloadHex }) {
    const sourceBytes = parseIpv4Address(sourceIp, "源 IP");
    const destBytes = parseIpv4Address(destIp, "目的 IP");
    const protocolByte = parseDecimalByte(protocol, "协议");
    const ttlByte = parseDecimalByte(ttl, "TTL");
    const payloadNormalized = normalizeHex(payloadHex || "");
    if (payloadNormalized.length % 2 !== 0) {
        throw new Error("载荷十六进制字符数量必须为偶数。");
    }
    const payloadBytes = payloadNormalized ? hexStringToBytes(payloadNormalized) : [];
    const totalLength = 20 + payloadBytes.length;
    if (totalLength > 0xffff) {
        throw new Error("IP 包总长度超过 65535 字节。");
    }

    const header = [
        0x45, 0x00,
        (totalLength >>> 8) & 0xff, totalLength & 0xff,
        0x1c, 0x46,
        0x40, 0x00,
        ttlByte,
        protocolByte,
        0x00, 0x00,
        ...sourceBytes,
        ...destBytes,
    ];
    const checksum = calculateIpv4HeaderChecksum(header);
    header[10] = (checksum >>> 8) & 0xff;
    header[11] = checksum & 0xff;

    return bytesToHex([...header, ...payloadBytes]);
}

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
    const buildBtn = document.getElementById("buildIpPacketBtn");
    const copyBuildBtn = document.getElementById("copyIpBuildResultBtn");
    const fillValidateBtn = document.getElementById("ipValidateFromBuildBtn");
    const srcInput = document.getElementById("ipBuilderSrcIp");
    const dstInput = document.getElementById("ipBuilderDstIp");
    const protocolInput = document.getElementById("ipBuilderProtocol");
    const ttlInput = document.getElementById("ipBuilderTtl");
    const payloadInput = document.getElementById("ipBuilderPayload");
    const buildResult = document.getElementById("ipBuildResult");
    const validateBtn = document.getElementById("validateIpPacketBtn");
    const ipPacketInput = document.getElementById("ipPacketInput");
    const buildStatusId = "ipBuildStatus";
    const statusId = "ipValidateStatus";

    if (!validateBtn || !ipPacketInput) {
        return;
    }

    buildBtn?.addEventListener("click", () => {
        try {
            const packetHex = buildIpv4Packet({
                sourceIp: srcInput?.value ?? "",
                destIp: dstInput?.value ?? "",
                protocol: protocolInput?.value ?? "17",
                ttl: ttlInput?.value ?? "64",
                payloadHex: payloadInput?.value ?? "",
            });
            if (buildResult) {
                buildResult.value = packetHex;
            }
            setStatus(`IP 包构建成功，共 ${packetHex.length / 2} 字节。`, "success", buildStatusId);
        } catch (error) {
            if (buildResult) {
                buildResult.value = "";
            }
            setStatus(error.message, "error", buildStatusId);
        }
    });

    copyBuildBtn?.addEventListener("click", async () => {
        const value = buildResult?.value ?? "";
        if (!value) {
            setStatus("没有可复制的 IP 包。", "info", buildStatusId);
            return;
        }
        try {
            await navigator.clipboard.writeText(value);
            setStatus("IP 包已复制到剪贴板。", "success", buildStatusId);
        } catch (error) {
            setStatus("浏览器未允许访问剪贴板。", "error", buildStatusId);
        }
    });

    fillValidateBtn?.addEventListener("click", () => {
        const value = buildResult?.value ?? "";
        if (!value) {
            setStatus("请先构建 IP 包。", "info", statusId);
            return;
        }
        ipPacketInput.value = value;
        setStatus("已填入封装结果，可继续点击验证。", "success", statusId);
    });

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

function attachAudioPcmParser() {
    const fileInput = document.getElementById("audioLogFile");
    const initialFilterInput = document.getElementById("audioInitialFilter");
    const sendPrefixInput = document.getElementById("audioSendPrefix");
    const recvPrefixInput = document.getElementById("audioRecvPrefix");
    const scanBtn = document.getElementById("scanAudioCallsBtn");
    const generateBtn = document.getElementById("generateAudioPcmBtn");
    const callSelect = document.getElementById("audioCallSelect");
    const clearBtn = document.getElementById("clearAudioPcmBtn");
    const statusId = "audioPcmStatus";
    const defaultValues = {
        initialFilter: "RIL_TT-AT",
        sendPrefix: "AT^DAUDPCM=",
        recvPrefix: "^DAUDPCM:",
    };
    let scanState = null;

    if (!fileInput || !initialFilterInput || !sendPrefixInput || !recvPrefixInput || !scanBtn || !generateBtn || !callSelect || !clearBtn) {
        return;
    }

    const resetCallSelect = (message = "请先扫描通话") => {
        callSelect.innerHTML = `<option value="">${message}</option>`;
        callSelect.disabled = true;
    };

    const renderCallOptions = (calls) => {
        if (!calls.length) {
            resetCallSelect("未识别到通话");
            return;
        }

        callSelect.disabled = false;
        callSelect.innerHTML = calls.map((call) => {
            const endFlag = call.explicitEnd ? "明确结束" : "兜底结束";
            const answerFlag = call.answered ? `已接听 ${call.answerTime}` : "未接听";
            const label = `#${call.index + 1} ${call.direction} ${call.number} | ${call.startTime} -> ${call.endTime} | ${answerFlag} | ${endFlag} | 发${call.sendHitCount}/收${call.recvHitCount}`;
            return `<option value="${call.index}">${escapeHtml(label)}</option>`;
        }).join("");
    };

    const readSelectedFileText = async () => {
        const file = fileInput.files?.[0];
        if (!file) {
            renderAudioPcmResult(null);
            setStatus("请先选择txt日志文件。", "error", statusId);
            return null;
        }

        if (!/\.(txt|log)$/i.test(file.name)) {
            renderAudioPcmResult(null);
            setStatus("当前只处理txt或log日志文件。", "error", statusId);
            return null;
        }

        return file.text();
    };

    scanBtn.addEventListener("click", async () => {
        const text = await readSelectedFileText();
        if (text === null) {
            return;
        }

        try {
            setStatus("正在扫描通话...", "info", statusId);
            scanState = scanAudioCalls(text, {
                initialFilter: initialFilterInput.value,
                sendPrefix: sendPrefixInput.value,
                recvPrefix: recvPrefixInput.value,
            });
            renderAudioScanResult(scanState);
            renderCallOptions(scanState.calls);

            if (scanState.calls.length === 0) {
                setStatus(`扫描完成：原始 ${scanState.totalLines} 行，初筛 ${scanState.filteredLines} 行，未识别到通话。`, "info", statusId);
                return;
            }

            setStatus(`扫描完成：原始 ${scanState.totalLines} 行，初筛 ${scanState.filteredLines} 行，识别到 ${scanState.calls.length} 通电话。`, "success", statusId);
        } catch (error) {
            scanState = null;
            resetCallSelect();
            renderAudioPcmResult(null);
            setStatus(error.message, "error", statusId);
        }
    });

    generateBtn.addEventListener("click", () => {
        if (!scanState || !scanState.calls.length) {
            setStatus("请先扫描通话并选择一通电话。", "error", statusId);
            return;
        }

        const selectedIndex = parseInt(callSelect.value, 10);
        const call = scanState.calls[selectedIndex];
        if (!call) {
            setStatus("请选择有效的通话记录。", "error", statusId);
            return;
        }

        try {
            const result = parseAudioPcmEntries(call.entries, {
                sendPrefix: sendPrefixInput.value,
                recvPrefix: recvPrefixInput.value,
                totalLines: scanState.totalLines,
            });
            const files = buildAudioDownloadFiles(result, call);
            renderAudioPcmResult(result, files, call);

            const skippedLines = result.send.skippedLines + result.recv.skippedLines;
            const skippedText = skippedLines > 0 ? `，跳过 ${skippedLines} 行异常Base64` : "";
            if (files.length === 0) {
                setStatus(`生成完成：所选通话没有可写入的PCM数据${skippedText}。`, "info", statusId);
                return;
            }

            setStatus(`生成完成：${files.map((file) => file.filename).join("、")}${skippedText}。请在结果区手动下载。`, "success", statusId);
        } catch (error) {
            setStatus(error.message, "error", statusId);
        }
    });

    clearBtn.addEventListener("click", () => {
        fileInput.value = "";
        initialFilterInput.value = defaultValues.initialFilter;
        sendPrefixInput.value = defaultValues.sendPrefix;
        recvPrefixInput.value = defaultValues.recvPrefix;
        scanState = null;
        resetCallSelect();
        renderAudioPcmResult(null);
        setStatus("", "info", statusId);
    });

    [fileInput, initialFilterInput, sendPrefixInput, recvPrefixInput].forEach((input) => {
        input.addEventListener("input", () => {
            scanState = null;
            resetCallSelect();
            renderAudioPcmResult(null);
            setStatus("", "info", statusId);
        });
    });

    fileInput.addEventListener("change", () => {
        scanState = null;
        resetCallSelect();
        renderAudioPcmResult(null);
        setStatus("", "info", statusId);
    });

    resetCallSelect();
}
