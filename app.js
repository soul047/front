(() => {
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu%2BRc8%2BySKeHrYO6qaS19Sg%3D%3D';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'be29697319e13590895593f5f5508348';
  
  // 성공적으로 동작하는 API만 남겨둡니다.
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;
  
  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  function drawGauge(pmType, value, station) {
    const wheelEl = document.getElementById(`gauge${pmType}`);
    const statusTextEl = document.getElementById(`statusText${pmType}`);
    const valueTextEl = document.getElementById(`valueText${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);

    if (!wheelEl || !statusTextEl || !valueTextEl || !stationEl) {
      console.error(`${pmType} 관련 요소를 찾을 수 없습니다.`);
      return;
    }

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

  // fetchAirData 함수를 약간 수정하여, 데이터가 실제로 있는지 여부를 반환하도록 합니다.
  async function fetchAirData(station) {
    try {
      if (!station) return null; // 검색할 측정소 이름이 없으면 null 반환
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      const res = await fetch(url);
      if (!res.ok) throw new Error(`AirKorea 데이터 API HTTP ${res.status}`);
      const data = await res.json();
      const item = data.response.body.items[0];
      
      // 데이터가 없거나, pm10Value가 유효하지 않으면 null 반환
      if (!item || !item.pm10Value) {
        console.warn(`'${station}' 측정소 데이터를 찾을 수 없습니다.`);
        return null;
      }
      return { 
        pm10: parseFloat(item.pm10Value) || 0, 
        pm25: parseFloat(item.pm25Value) || 0, 
        station: station // 실제 사용된 측정소 이름
      };
    } catch (e) {
      console.error(`'${station}' 측정소 조회 중 오류:`, e);
      return null;
    }
  }

  // --- 여기가 완전히 새로워진 핵심 로직입니다 ---
  async function updateAirQuality(lat, lon) {
    // 1. 좌표로 행정구역 정보 가져오기
    let regionData;
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      if (!res.ok) throw new Error('카카오 지역 변환 실패');
      const data = await res.json();
      regionData = data.documents[0]?.address;
      if (!regionData) throw new Error('주소 정보를 찾을 수 없음');
      
      // 화면 상단 지역 이름 업데이트
      document.getElementById('region').textContent = regionData.address_name;

    } catch (e) {
      console.error("주소 정보 조회 실패:", e);
      alert("주소 정보를 가져오는 데 실패했습니다.");
      return;
    }

    // 2. 행정구역 이름으로 측정소 데이터 조회 (동 -> 구 -> 시 순으로 시도)
    const dongName = regionData.region_3depth_name; // 동 이름 (예: 가평읍)
    const guName = regionData.region_2depth_name; // 군/구 이름 (예: 가평군)
    
    let airData = await fetchAirData(dongName); // 1순위: 동 이름으로 시도
    
    if (!airData) {
      airData = await fetchAirData(guName); // 2순위: 군/구 이름으로 시도
    }

    // 3. 최종적으로 데이터를 화면에 그리기
    if (airData) {
      drawGauge('PM10', airData.pm10, airData.station);
      drawGauge('PM25', airData.pm25, airData.station);
    } else {
      alert(`'${guName}' 지역의 측정소 데이터를 찾을 수 없습니다. 다른 지역을 검색해 주세요.`);
      // 데이터가 없을 경우 게이지 초기화
      drawGauge('PM10', 0, '정보 없음');
      drawGauge('PM25', 0, '정보 없음');
    }
  }

  // updateAll 함수를 새 로직에 맞게 간소화
  async function updateAll(lat, lon) {
    updateAirQuality(lat, lon);
    updateDateTime();
  }
  
  // (이하 검색, 현재위치 등 나머지 코드는 대부분 동일)
  const input = document.getElementById('place');
  const sug = document.getElementById('suggestions');
  let debounceTimer;

  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const query = input.value;
      if (!query) {
        sug.innerHTML = '';
        return;
      }
      try {
        const q = encodeURIComponent(query);
        const res = await fetch(`${KAKAO_ADDRESS_API}?query=${q}`, {
          headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
        });
        if (!res.ok) throw new Error(`Kakao 검색 API HTTP ${res.status}`);
        const { documents } = await res.json();
        sug.innerHTML = '';
        documents.slice(0, 5).forEach(d => {
          const li = document.createElement('li');
          li.textContent = d.address_name;
          li.dataset.lat = d.y;
          li.dataset.lon = d.x;
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
    }, 300); 
  });

  document.getElementById('searchBtn').onclick = async () => {
    const query = input.value.trim();

    if (!query) {
      alert('검색할 지역을 입력해 주세요.');
      return;
    }

    sug.innerHTML = '';

    try {
      const q = encodeURIComponent(query);
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${q}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });

      if (!res.ok) throw new Error(`Kakao 검색 API HTTP ${res.status}`);
      
      const { documents } = await res.json();

      if (documents.length > 0) {
        const firstResult = documents[0];
        updateAll(firstResult.y, firstResult.x);
        input.value = firstResult.address_name;
      } else {
        alert(`'${query}'에 대한 검색 결과가 없습니다.`);
      }
    } catch (e) {
      console.error('검색 버튼 클릭 오류:', e);
      alert('검색 중 오류가 발생했습니다.');
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
      updateAll(37.5729, 126.9794);
    }
  );

  function updateDateTime() {
    const timeEl = document.getElementById('time');
    if(timeEl) timeEl.textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  setInterval(updateDateTime, 60000);
  
})();