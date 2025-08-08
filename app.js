(() => {
  // stations 배열은 gps.js 파일로 분리되었습니다.
  // 이 파일은 gps.js에 정의된 전역 stations 변수를 사용합니다.

  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  
  const inputEl = document.getElementById('place');
  const suggestionsEl = document.getElementById('suggestions');
  const errorEl = document.getElementById('error-message');
  const gaugesEl = document.getElementById('gauges');

  function calculateDistance(lat1, lon1, lat2, lon2) {
    const dx = lon1 - lon2;
    const dy = lat1 - lat2;
    return dx * dx + dy * dy;
  }

  function findNearestStation(userLat, userLon) {
    let closestStation = null;
    let minDistance = Infinity;

    // gps.js에 정의된 전역 stations 배열을 사용합니다.
    stations.forEach(station => {
      const distance = calculateDistance(userLat, userLon, station.lat, station.lon);
      if (distance < minDistance) {
        minDistance = distance;
        closestStation = station;
      }
    });
    return closestStation.name;
  }

  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);

    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) return;

    const status = getStatus(value);
    const ratio = Math.min(value / 150, 1);
    const deg = 360 * ratio;

    wheelEl.style.setProperty('--gauge-color', status.color);
    wheelEl.style.setProperty('--angle', `${deg}deg`);
    statusTextEl.textContent = status.name;
    statusTextEl.style.color = status.color;
    valueTextEl.textContent = `${value} µg/m³`;
    stationEl.textContent = `측정소: ${station}`;
  }

   // --- 방문자 수 집계 로직 (시작) ---
  function updateVisitorCount() {
    const KEY = 'pm25_stats';
    // JSON.parse가 실패할 경우를 대비해 try-catch 구문 추가
    let stats;
    try {
      stats = JSON.parse(localStorage.getItem(KEY) || '{"total":0,"today":0,"last":""}');
    } catch (e) {
      stats = {"total":0,"today":0,"last":""};
    }
    
    const today = new Date().toISOString().slice(0, 10);

    if (stats.last !== today) {
      stats.today = 0;
      stats.last = today;
    }
    stats.today++;
    stats.total++;

    localStorage.setItem(KEY, JSON.stringify(stats));
  }
  // --- 방문자 수 집계 로직 (끝) ---


  async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`AirKorea 데이터 API 오류`);
      const data = await res.json();
      const item = data.response.body.items[0];
      if (!item || !item.pm10Value) {
        return { pm10: 0, pm25: 0, station: `${station} (데이터 없음)` };
      }
      return { 
        pm10: parseFloat(item.pm10Value) || 0, 
        pm25: parseFloat(item.pm25Value) || 0, 
        station: station
      };
    } catch (e) {
      console.error(`AirKorea 데이터 API 오류:`, e);
      return { pm10: 0, pm25: 0, station: `${station} (조회 실패)` };
    }
  }

  async function updateAll(lat, lon) {
    errorEl.style.display = 'none';

    const stationName = findNearestStation(lat, lon);
    const airData = await fetchAirData(stationName);
    
    drawGauge('PM10', airData.pm10, airData.station);
    drawGauge('PM25', airData.pm25, airData.station);

    updateRegionText(lat, lon);
    updateDateTime();
    
    if (gaugesEl) {
      gaugesEl.classList.add('blink');
      setTimeout(() => gaugesEl.classList.remove('blink'), 500);
    }
  }
  
  let debounceTimer;
  inputEl.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = inputEl.value;
      if (!query) {
        suggestionsEl.innerHTML = '';
        return;
      }
      try {
        const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
        if (!res.ok) return;
        const { documents } = await res.json();
        suggestionsEl.innerHTML = '';
        documents.slice(0, 5).forEach(d => {
          const li = document.createElement('li');
          li.textContent = d.address_name;
          li.onclick = () => {
            inputEl.value = d.address_name;
            suggestionsEl.innerHTML = '';
            updateAll(d.y, d.x);
          };
          suggestionsEl.appendChild(li);
        });
      } catch (e) {
        console.error('카카오 검색 오류:', e);
      }
    }, 300); 
  });

  document.getElementById('searchBtn').onclick = async () => {
    const query = inputEl.value.trim();
    if (!query) {
      alert('검색할 지역을 입력해 주세요.');
      return;
    }
    suggestionsEl.innerHTML = '';
    try {
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${encodeURIComponent(query)}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      if (documents.length > 0) {
        const { y, x, address_name } = documents[0];
        updateAll(y, x);
        inputEl.value = address_name;
      } else {
        errorEl.textContent = `'${query}'에 대한 검색 결과가 없습니다.`;
        errorEl.style.display = 'block';
      }
    } catch (e) {
      errorEl.textContent = '검색 중 오류가 발생했습니다.';
      errorEl.style.display = 'block';
    }
  };

   // --- 관리자 로그인 버튼 핸들러 다시 추가 ---
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.onclick = () => {
      const pw = prompt('비밀번호를 입력하세요.');
      if (pw === 'leesoul0407!') {
        window.location.href = 'admin.html';
      } else if (pw) { // 사용자가 무언가 입력했지만 틀렸을 경우
        alert('비밀번호가 일치하지 않습니다.');
      }
    };
  }

   // --- 공유 버튼 로직 추가 ---
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      const url = window.location.href;
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);

      // 복사 완료 메시지 표시
      const toast = document.getElementById('toast-message');
      toast.textContent = 'URL이 복사되었어요!';
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
      }, 2000);
    };
  }

  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => {
      alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울 종로구)로 조회합니다.');
      updateAll(37.572016, 126.975319);
    }
  );

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if(timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  
  async function updateRegionText(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, { headers: { Authorization: `KakaoAK ${KAKAO_KEY}` } });
      if (!res.ok) throw new Error();
      const { documents } = await res.json();
      regionEl.textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      regionEl.textContent = '주소 조회 실패';
    }
  }
  
  // --- 바로가기 팝업 로직 (추가) ---
  function handlePwaPopup() {
    const popup = document.getElementById('pwa-popup');
    const closeBtn = document.getElementById('pwa-close-btn');
    const PWA_PROMPT_SHOWN_KEY = 'pwaPromptShown';

    // 이미 팝업을 본 적이 있으면 함수 종료
    if (localStorage.getItem(PWA_PROMPT_SHOWN_KEY)) {
      return;
    }

    if (popup && closeBtn) {
      popup.style.display = 'flex'; // 팝업 보이기
      
      closeBtn.onclick = () => {
        popup.style.display = 'none';
        // 팝업을 닫았다는 사실을 localStorage에 기록
        localStorage.setItem(PWA_PROMPT_SHOWN_KEY, 'true');
      };
    }
  }

  // 페이지 로드가 완료되면 팝업 로직 실행
  window.addEventListener('load', handlePwaPopup);
  
  updateDateTime();
  setInterval(updateDateTime, 60000);
})();