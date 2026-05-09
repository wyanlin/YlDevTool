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
