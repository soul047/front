(() => {
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const NEARBY_API = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList?serviceKey=${AIRKOREA_KEY}&returnType=json&tmX={tmX}&tmY={tmY}`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  const KAKAO_TM_API = `https://dapi.kakao.com/v2/local/geo/transcoord.json`; // TM 좌표 변환용 API

  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  // 방어 코드가 추가된 drawGauge 함수
  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    
    // 요소가 존재하는지 확인 후 업데이트 (TypeError 방지)
    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) {
      console.error(`${pmType} 관련 요소를 찾을 수 없습니다.`);
      return;
    }

    const status = getStatus(value);
    const ratio = Math.min(value / 150, 1);
    const deg = 360 * ratio;
    wheelEl.style.setProperty('--angle', `${deg}deg`);

    statusTextEl.textContent = status.name;
    statusTextEl.style.color = status.color;
    valueTextEl.textContent = `${value} µg/m³`;
    stationEl.textContent = `측정소: ${station}`;
  }

  async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`AirKorea 데이터 API HTTP ${res.status}`);
      const data = await res.json();
      const item = data.response.body.items[0];
      if (!item || !item.pm10Value) {
        console.warn(`${station} 측정소의 데이터가 없습니다. 기본값을 사용합니다.`);
        return { pm10: 0, pm25: 0, station };
      }
      return { pm10: parseFloat(item.pm10Value) || 0, pm25: parseFloat(item.pm25Value) || 0, station };
    } catch (e) {
      console.error('AirKorea 데이터 API 오류:', e);
      return { pm10: 0, pm25: 0, station };
    }
  }

  // **핵심 오류 수정**: TM 좌표를 정상적으로 변환하고 사용하도록 수정된 함수
  async function getNearestStation(lat, lon) {
    try {
      // 1. 카카오 API로 WGS84(위경도) -> TM 좌표로 변환
      const tmUrl = `${KAKAO_TM_API}?x=${lon}&y=${lat}&input_coord=WGS84&output_coord=TM`;
      const tmRes = await fetch(tmUrl, {
          headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      if (!tmRes.ok) throw new Error(`Kakao TM 변환 API HTTP ${tmRes.status}`);
      const tmData = await tmRes.json();
      if (!tmData.documents || tmData.documents.length === 0) {
        throw new Error('카카오 TM 좌표 변환에 실패했습니다.');
      }
      const tmX = tmData.documents[0].x; // 변환된 TM X좌표
      const tmY = tmData.documents[0].y; // 변환된 TM Y좌표

      // 2. 변환된 TM 좌표로 AirKorea API에 가까운 측정소 요청
      const nearbyUrl = NEARBY_API.replace('{tmX}', tmX).replace('{tmY}', tmY);
      const res = await fetch(nearbyUrl);
      if (!res.ok) throw new Error(`AirKorea 측정소 API HTTP ${res.status}`);
      const data = await res.json();
      const item = data.response.body.items[0];
      if (!item) throw new Error('주변 측정소 정보를 찾을 수 없습니다.');
      
      return item.stationName;

    } catch (e) {
      console.error('측정소 조회 과정 오류:', e);
      return '종로구'; // 오류 발생 시 기본 측정소
    }
  }

  async function updateAll(lat, lon) {
    const station = await getNearestStation(lat, lon);
    const { pm10, pm25 } = await fetchAirData(station);
    drawGauge('PM10', pm10, station);
    drawGauge('PM25', pm25, station);
    updateRegion(lat, lon);
    updateDateTime();
  }

  const input = document.getElementById('place');
  const sug = document.getElementById('suggestions');
  
  input.addEventListener('input', async () => {
    if (!input.value) {
      sug.innerHTML = '';
      return;
    }
    try {
      const q = encodeURIComponent(input.value);
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${q}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      if (!res.ok) throw new Error(`Kakao 검색 API HTTP ${res.status}`);
      const { documents } = await res.json();
      sug.innerHTML = '';
      documents.slice(0, 5).forEach(d => {
        const li = document.createElement('li');
        li.textContent = d.address_name;
        li.dataset.lat = d.y; // 데이터 속성에 좌표 저장
        li.dataset.lon = d.x; // 데이터 속성에 좌표 저장
        li.onclick = () => {
          input.value = d.address_name;
          sug.innerHTML = '';
          updateAll(d.y, d.x);
        };
        sug.appendChild(li);
      });
    } catch (e) {
      console.error('Kakao 검색 오류:', e);
    }
  });

  document.getElementById('searchBtn').onclick = () => {
    const firstSuggestion = sug.querySelector('li');
    if (firstSuggestion) {
      // 저장해둔 좌표를 이용해 바로 업데이트
      updateAll(firstSuggestion.dataset.lat, firstSuggestion.dataset.lon);
      input.value = firstSuggestion.textContent; // 입력창 텍스트도 업데이트
      sug.innerHTML = ''; // 추천 목록 닫기
    } else {
      alert('검색 결과가 없습니다. 다른 키워드로 검색해 보세요.');
    }
  };

  document.getElementById('adminBtn').onclick = () => {
    const pw = prompt('비밀번호');
    if (pw === 'leesoul0407!') location.href = 'admin.html';
  };

  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => {
      console.error('위치 수집에 실패했습니다. 기본 위치로 조회합니다.');
      alert('위치 정보를 가져올 수 없습니다. 기본 위치(서울 종로구)로 조회합니다.');
      updateAll(37.5729, 126.9794); // 서울 종로구 좌표
    }
  );

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if(timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  setInterval(updateDateTime, 60000);

  async function updateRegion(lat, lon) {
    const regionEl = document.getElementById('region');
    if (!regionEl) return;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      if (!res.ok) throw new Error(`Kakao 지역 변환 API HTTP ${res.status}`);
      const { documents } = await res.json();
      regionEl.textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      console.error('지역 업데이트 오류:', e);
      regionEl.textContent = '조회 실패';
    }
  }
})();