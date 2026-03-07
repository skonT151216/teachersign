
import React, { useState, useMemo, useEffect } from 'react';
import { TrainingSession, Staff, Signature } from '../types';

interface PrintReportProps {
    session: TrainingSession;
    staffList: Staff[];
    onClose: () => void;
    onDeleteSignature: (staffId: string) => void;
}

interface ReportRow {
    id: string;
    dept: string;
    name: string;
    affiliation?: string;
    signature?: Signature;
}

// Options for rows per page (26 to 40, even numbers only)
const ROW_OPTIONS = [26, 28, 30, 32, 34, 36, 38, 40];

// Default Priority for Reset
const DEFAULT_PRIORITY = ['교장', '교감', '수석교사', '부장교사', '교사', '행정실장', '주무관', '교육공무직'];

const PrintReport: React.FC<PrintReportProps> = ({ session, staffList, onClose, onDeleteSignature }) => {
    const [deleteMode, setDeleteMode] = useState(false);
    const [selectedDepts, setSelectedDepts] = useState<string[]>([]);
    const [isFilterOpen, setIsFilterOpen] = useState(false);

    // Custom Sort Order State
    const [isSortOrderModalOpen, setIsSortOrderModalOpen] = useState(false);
    const [customSortOrder, setCustomSortOrder] = useState<string[]>([]);

    // State for rows per page customization (Default 26)
    const [rowsPerPage, setRowsPerPage] = useState<number>(26);

    // State for sorting method (Only relevant for Office mode)
    const [sortMethod, setSortMethod] = useState<'default' | 'affiliation'>('default');

    const isOffice = session.type === 'office';

    // Dynamic style calculation to maximize visibility based on density
    const rowStyles = useMemo(() => {
        switch (rowsPerPage) {
            case 26: return { row: 'h-[64px]', img: 'h-[50px]', text: 'text-base' };
            case 28: return { row: 'h-[60px]', img: 'h-[46px]', text: 'text-sm' };
            case 30: return { row: 'h-[56px]', img: 'h-[42px]', text: 'text-sm' };
            case 32: return { row: 'h-[52px]', img: 'h-[38px]', text: 'text-sm' };
            case 34: return { row: 'h-[49px]', img: 'h-[36px]', text: 'text-xs' };
            case 36: return { row: 'h-[46px]', img: 'h-[34px]', text: 'text-xs' };
            case 38: return { row: 'h-[44px]', img: 'h-[32px]', text: 'text-xs' };
            case 40: return { row: 'h-[42px]', img: 'h-[30px]', text: 'text-xs' };
            default: return { row: 'h-[64px]', img: 'h-[50px]', text: 'text-base' };
        }
    }, [rowsPerPage]);

    const rowsPerColumn = rowsPerPage / 2;

    // 1. Memoize Raw Data
    const rawData: ReportRow[] = useMemo(() => {
        if (session.type === 'school') {
            return staffList.map(staff => ({
                id: staff.id,
                dept: staff.department,
                name: staff.name,
                affiliation: staff.affiliation,
                signature: session.signatures.find(s => s.staffId === staff.id)
            }));
        } else {
            return session.signatures.map(sig => ({
                id: sig.staffId,
                dept: sig.department,
                name: sig.staffName,
                affiliation: sig.affiliation,
                signature: sig
            }));
        }
    }, [session, staffList]);

    // 2. Initialize and Sync Custom Sort Order
    // Get all unique departments from current data
    const availableDepts = useMemo(() => Array.from(new Set(rawData.map(r => r.dept))), [rawData]);

    useEffect(() => {
        const savedOrderStr = localStorage.getItem('training_app_sort_order_v2');
        let baseOrder: string[] = [];

        if (savedOrderStr) {
            baseOrder = JSON.parse(savedOrderStr);
        } else {
            baseOrder = [...DEFAULT_PRIORITY];
        }

        // Merge: Keep saved order for existing items, append new items found in data
        const mergedOrder = [...baseOrder];
        availableDepts.forEach(dept => {
            if (!mergedOrder.includes(dept)) {
                mergedOrder.push(dept);
            }
        });

        // Filter out items that don't exist in current data (optional, but keeps list clean for this session)
        // Actually, let's keep them to preserve order for other sessions, 
        // but for UI rendering we might want to filter. 
        // For now, let's just use the merged list as the source of truth.

        // Save updated merged list if it changed length (new items added)
        if (mergedOrder.length > baseOrder.length) {
            localStorage.setItem('training_app_sort_order_v2', JSON.stringify(mergedOrder));
        }

        setCustomSortOrder(mergedOrder);
    }, [availableDepts]); // Depend on availableDepts to update when data loads

    // 3. Memoize Sorted Positions (for Filter and Sort Logic)
    // This derives the effective list of departments present in THIS session, ordered by customSortOrder
    const sortedPositions = useMemo(() => {
        return availableDepts.sort((a, b) => {
            const idxA = customSortOrder.indexOf(a);
            const idxB = customSortOrder.indexOf(b);
            // If not found in custom order (shouldn't happen due to useEffect), put at end
            if (idxA === -1 && idxB === -1) return a.localeCompare(b);
            if (idxA === -1) return 1;
            if (idxB === -1) return -1;
            return idxA - idxB;
        });
    }, [availableDepts, customSortOrder]);

    // Initial selection for filters
    useEffect(() => {
        // Only set selected depts initially if empty (to avoid resetting on re-renders)
        if (selectedDepts.length === 0 && sortedPositions.length > 0) {
            setSelectedDepts(sortedPositions);
        }
    }, [sortedPositions]);


    // Filter and Sort Rows
    const rows = useMemo(() => {
        return rawData
            .filter(row => selectedDepts.includes(row.dept))
            .sort((a, b) => {
                if (isOffice && sortMethod === 'affiliation') {
                    const affA = a.affiliation || '';
                    const affB = b.affiliation || '';
                    if (affA !== affB) return affA.localeCompare(affB);
                    return a.name.localeCompare(b.name);
                }

                // Use Custom Sort Order
                const idxA = customSortOrder.indexOf(a.dept);
                const idxB = customSortOrder.indexOf(b.dept);

                if (idxA !== -1 && idxB !== -1) {
                    if (idxA !== idxB) return idxA - idxB;
                } else if (idxA !== -1) {
                    return -1;
                } else if (idxB !== -1) {
                    return 1;
                } else {
                    if (a.dept !== b.dept) return a.dept.localeCompare(b.dept);
                }
                return a.name.localeCompare(b.name);
            });
    }, [rawData, selectedDepts, sortMethod, isOffice, customSortOrder]);

    // Pagination Logic
    const pages = useMemo(() => {
        const pgs = [];
        for (let i = 0; i < rows.length; i += rowsPerPage) {
            pgs.push(rows.slice(i, i + rowsPerPage));
        }
        return pgs.length > 0 ? pgs : [[]];
    }, [rows, rowsPerPage]);

    const toggleDept = (dept: string) => {
        setSelectedDepts(prev =>
            prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]
        );
    };

    const selectAll = () => setSelectedDepts(sortedPositions);
    const deselectAll = () => setSelectedDepts([]);

    const handlePrint = () => window.print();

    // --- Sort Order Customization Handlers ---
    const moveSortItem = (index: number, direction: 'up' | 'down') => {
        const newOrder = [...customSortOrder];
        if (direction === 'up') {
            if (index === 0) return;
            [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
        } else {
            if (index === newOrder.length - 1) return;
            [newOrder[index + 1], newOrder[index]] = [newOrder[index], newOrder[index + 1]];
        }
        setCustomSortOrder(newOrder);
        localStorage.setItem('training_app_sort_order_v2', JSON.stringify(newOrder));
    };

    const resetSortOrder = () => {
        if (confirm('직위 정렬 순서를 기본값으로 초기화하시겠습니까?')) {
            // Reset to default, but append any other known depts that are not in default
            const others = customSortOrder.filter(d => !DEFAULT_PRIORITY.includes(d));
            const newOrder = [...DEFAULT_PRIORITY, ...others];
            setCustomSortOrder(newOrder);
            localStorage.setItem('training_app_sort_order_v2', JSON.stringify(newOrder));
        }
    };

    // Helper Component for Table Column
    const TableColumn = ({ data, startIndex }: { data: ReportRow[], startIndex: number }) => (
        <table className="w-full border-collapse border border-gray-400 text-center text-sm table-fixed">
            <colgroup>
                {isOffice ? (
                    <>
                        <col className="w-[30px]" />
                        <col className="w-[80px]" />
                        <col className="w-[60px]" />
                        <col className="w-[60px]" />
                        <col />
                    </>
                ) : (
                    <>
                        <col className="w-10" />
                        <col className="w-20" />
                        <col className="w-20" />
                        <col />
                    </>
                )}
            </colgroup>
            <thead>
                <tr className="bg-gray-100 h-8">
                    <th className="border border-gray-400 p-1 text-xs">연번</th>
                    {isOffice && <th className="border border-gray-400 p-1 text-xs">소속</th>}
                    <th className="border border-gray-400 p-1 text-xs">직위</th>
                    <th className="border border-gray-400 p-1 text-xs">성명</th>
                    <th className="border border-gray-400 p-1 text-xs">서명</th>
                </tr>
            </thead>
            <tbody>
                {data.map((row, idx) => (
                    <tr key={row.id} className={rowStyles.row}>
                        <td className="border border-gray-400 p-1 text-gray-600 font-mono text-xs">{startIndex + idx}</td>

                        {isOffice && (
                            <td className={`border border-gray-400 p-1 ${rowStyles.text}`}>
                                <div className="leading-tight px-1 whitespace-normal break-words" title={row.affiliation}>{row.affiliation || '-'}</div>
                            </td>
                        )}

                        <td className="border border-gray-400 p-1">
                            {!isOffice && row.affiliation && <div className="text-[10px] text-gray-500 leading-tight whitespace-normal break-words">{row.affiliation}</div>}
                            <div className={`font-medium leading-tight whitespace-normal break-words ${rowStyles.text}`} title={row.dept}>{row.dept}</div>
                        </td>

                        <td className={`border border-gray-400 p-1 font-bold leading-tight whitespace-normal break-words ${rowStyles.text}`}>{row.name}</td>
                        <td className="border border-gray-400 p-0 relative group align-middle">
                            {row.signature ? (
                                <>
                                    <div className="w-full h-full flex items-center justify-center p-0.5">
                                        <img
                                            src={row.signature.signatureData}
                                            alt="서명"
                                            className={`${rowStyles.img} max-w-full object-contain`}
                                        />
                                    </div>
                                    {deleteMode && (
                                        <button
                                            onClick={() => row.signature && onDeleteSignature(row.signature.staffId)}
                                            className="absolute inset-0 bg-red-50/80 flex items-center justify-center text-red-600 font-bold opacity-0 group-hover:opacity-100 no-print border-2 border-red-400 transition-all duration-75 active:scale-90 active:bg-red-500 active:text-white"
                                            title="서명 삭제"
                                        >
                                            삭제
                                        </button>
                                    )}
                                </>
                            ) : null}
                        </td>
                    </tr>
                ))}
                {data.length < rowsPerColumn && Array.from({ length: rowsPerColumn - data.length }).map((_, idx) => (
                    <tr key={`empty-${idx}`} className={`${rowStyles.row} border border-gray-400`}>
                        <td className="border border-gray-400"></td>
                        {isOffice && <td className="border border-gray-400"></td>}
                        <td className="border border-gray-400"></td>
                        <td className="border border-gray-400"></td>
                        <td className="border border-gray-400"></td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="fixed inset-0 bg-gray-100 z-[60] flex flex-col print:relative print:inset-auto print:z-auto print:bg-white print:block print:overflow-visible print:h-auto">
            <div className="bg-white shadow p-4 flex flex-wrap gap-4 justify-between items-center no-print sticky top-0 z-20">
                <div className="flex flex-col">
                    <h2 className="text-xl font-bold text-gray-800">등록부 출력 미리보기</h2>
                    <span className="text-sm text-gray-500">출력 대상 {rows.length}명 / 총 {pages.length}페이지</span>
                </div>
                <div className="flex gap-2 items-center flex-wrap justify-end">
                    {isOffice && (
                        <div className="flex items-center gap-2 bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                            <span className="text-sm font-bold text-purple-700">정렬:</span>
                            <select
                                value={sortMethod}
                                onChange={(e) => setSortMethod(e.target.value as any)}
                                className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-purple-500 outline-none cursor-pointer"
                            >
                                <option value="default">직위순</option>
                                <option value="affiliation">소속순 (가나다)</option>
                            </select>
                        </div>
                    )}

                    <div className="flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                        <span className="text-sm font-bold text-gray-700">페이지당 인원:</span>
                        <select
                            value={rowsPerPage}
                            onChange={(e) => setRowsPerPage(Number(e.target.value))}
                            className="bg-white border border-gray-300 rounded px-2 py-1 text-sm font-bold text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                        >
                            {ROW_OPTIONS.map(opt => (
                                <option key={opt} value={opt}>{opt}명</option>
                            ))}
                        </select>
                    </div>

                    {/* Order Settings Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsSortOrderModalOpen(!isSortOrderModalOpen)}
                            className={`px-3 py-2 border rounded-lg text-sm font-bold flex items-center gap-1 ${isSortOrderModalOpen ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'bg-white border-gray-300 text-gray-700'}`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
                            직위 순서 설정
                        </button>

                        {isSortOrderModalOpen && (
                            <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-40">
                                <div className="flex justify-between items-center mb-3 border-b pb-2">
                                    <span className="font-bold text-gray-800 text-sm">직위 정렬 순서 변경</span>
                                    <button onClick={() => setIsSortOrderModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                                </div>
                                <div className="text-xs text-gray-500 mb-2">
                                    화살표를 눌러 직위의 높낮이(출력 순서)를 조정하세요. (위쪽이 먼저 출력됨)
                                </div>
                                <div className="max-h-60 overflow-y-auto space-y-1 mb-3 border rounded p-1 bg-gray-50">
                                    {customSortOrder.filter(d => availableDepts.includes(d)).map((dept, idx, arr) => (
                                        <div key={dept} className="flex items-center justify-between p-2 bg-white rounded border border-gray-100 shadow-sm">
                                            <span className="text-sm font-bold text-gray-700 truncate flex-1">{dept}</span>
                                            <div className="flex gap-1 ml-2">
                                                <button
                                                    onClick={() => moveSortItem(customSortOrder.indexOf(dept), 'up')}
                                                    disabled={idx === 0}
                                                    className={`p-1 rounded ${idx === 0 ? 'text-gray-300' : 'text-blue-600 hover:bg-blue-50'}`}
                                                >
                                                    ⬆️
                                                </button>
                                                <button
                                                    onClick={() => moveSortItem(customSortOrder.indexOf(dept), 'down')}
                                                    disabled={idx === arr.length - 1}
                                                    className={`p-1 rounded ${idx === arr.length - 1 ? 'text-gray-300' : 'text-blue-600 hover:bg-blue-50'}`}
                                                >
                                                    ⬇️
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {availableDepts.length === 0 && <div className="p-4 text-center text-gray-400 text-xs">데이터가 없습니다.</div>}
                                </div>
                                <button
                                    onClick={resetSortOrder}
                                    className="w-full py-2 bg-gray-100 text-gray-600 text-xs font-bold rounded hover:bg-gray-200 transition-colors"
                                >
                                    기본값으로 복원
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Filter Button */}
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterOpen(!isFilterOpen)}
                            className={`px-3 py-2 border rounded-lg text-sm font-bold flex items-center gap-1 ${isFilterOpen ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-300 text-gray-700'}`}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" /></svg>
                            직위 필터
                        </button>

                        {isFilterOpen && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 p-4 z-30">
                                <div className="flex justify-between items-center mb-3 border-b pb-2">
                                    <span className="font-bold text-gray-800">직위 필터</span>
                                    <button onClick={() => setIsFilterOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                                </div>
                                <div className="flex gap-2 mb-3">
                                    <button onClick={selectAll} className="flex-1 py-1 text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded font-bold hover:bg-blue-100 transition-colors">
                                        전체 선택
                                    </button>
                                    <button onClick={deselectAll} className="flex-1 py-1 text-xs bg-red-50 text-red-600 border border-red-100 rounded font-bold hover:bg-red-100 transition-colors">
                                        전체 해제
                                    </button>
                                </div>
                                <div className="max-h-60 overflow-y-auto space-y-1">
                                    {sortedPositions.map(dept => (
                                        <label key={dept} className="flex items-center gap-2 p-1 hover:bg-gray-50 rounded cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={selectedDepts.includes(dept)}
                                                onChange={() => toggleDept(dept)}
                                                className="rounded text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700">{dept}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer bg-red-50 px-3 py-2 rounded-lg border border-red-100 hover:bg-red-100 transition-colors">
                        <span className="text-sm font-bold text-red-700">삭제 모드</span>
                        <div className={`w-10 h-5 bg-gray-300 rounded-full relative transition-colors ${deleteMode ? 'bg-red-500' : ''}`}>
                            <div className={`w-3 h-3 bg-white rounded-full absolute top-1 left-1 transition-transform ${deleteMode ? 'translate-x-5' : ''}`}></div>
                        </div>
                        <input type="checkbox" checked={deleteMode} onChange={e => setDeleteMode(e.target.checked)} className="hidden" />
                    </label>

                    <button
                        onClick={handlePrint}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 shadow-sm"
                    >
                        인쇄
                    </button>
                    <button
                        onClick={onClose}
                        className="px-4 py-2 border border-gray-300 bg-white rounded-lg hover:bg-gray-50 font-medium text-gray-700"
                    >
                        닫기
                    </button>
                </div>
            </div>

            <div className="flex-1 p-8 bg-gray-100 overflow-auto print:p-0 print:bg-white print:overflow-visible print:h-auto print:block">
                {pages.map((pageRows, pageIdx) => (
                    <div key={pageIdx} className="bg-white shadow-lg mx-auto p-[10mm] w-[210mm] min-h-[297mm] print:h-[297mm] print:overflow-hidden mb-8 print:shadow-none print:mb-0 print:w-full break-after-page flex flex-col relative">
                        {pageIdx === 0 && (
                            <div className="text-center mb-4 relative">
                                <div className="text-left text-xs text-blue-600 font-medium absolute top-0 left-0">
                                    * 정렬 순서: {isOffice && sortMethod === 'affiliation' ? '소속(가나다순) > 성명' : '직위(사용자설정) > 성명(가나다순)'}
                                </div>
                                <div className="pt-5">
                                    <div className="text-xl font-bold text-gray-800 tracking-widest mb-1 leading-tight">[ {session.title} ]</div>
                                    <h1 className="text-2xl font-bold text-gray-900 mb-2">연수 등록부</h1>
                                </div>

                                <div className="flex justify-center gap-8 text-gray-700 font-medium border-b-2 border-gray-800 pb-2">
                                    <span>일시: {session.date}{session.time ? ` ${session.time}` : ''}</span>
                                    <span>장소: {session.schoolName}</span>
                                </div>
                                <div className="text-right text-xs text-gray-500 mt-1">
                                    연수대상자 {rows.length}명 / {rows.filter(r => r.signature).length}명 참가
                                </div>
                            </div>
                        )}
                        {pageIdx > 0 && <div className="h-10"></div>}

                        <div className="flex gap-4 flex-1 items-start content-start">
                            <div className="flex-1">
                                <TableColumn
                                    data={pageRows.slice(0, rowsPerColumn)}
                                    startIndex={pageIdx * rowsPerPage + 1}
                                />
                            </div>
                            <div className="flex-1">
                                <TableColumn
                                    data={pageRows.slice(rowsPerColumn)}
                                    startIndex={pageIdx * rowsPerPage + rowsPerColumn + 1}
                                />
                            </div>
                        </div>

                        {pageIdx === pages.length - 1 && (
                            <div className="mt-8 text-center text-gray-600 text-sm">
                                <p className="mb-6">위와 같이 연수를 실시하였음을 확인합니다.</p>
                                <div className="font-bold text-xl text-gray-900">{session.schoolName}</div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <style>{`
          @media print {
            .no-print { display: none !important; }
            body { background: white; -webkit-print-color-adjust: exact; margin: 0; padding: 0; }
            @page { margin: 0; size: A4; }
            .break-after-page { break-after: page; page-break-after: always; }
            html, body, #root { height: auto !important; overflow: visible !important; }
          }
       `}</style>
        </div>
    );
};

export default PrintReport;
