(() => {
  // 카테고리 정의
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  // API 키 (window.env로 접근)
  const AIRKOREA_KEY = window.env?.AIRKOREA_KEY || 'I2wDgBTJutEeubWmNzwVS1jlGSGPvjidKMb5DwhKkjM2MMUst8KGPB2D03mQv8GHu+Rc8+ySKeHrYO6qaS19Sg==';
  const KAKAO_KEY = window.env?.KAKAO_KEY || 'df1047fb57dcad7bb8270eae8272c4f6';
  const AIRKOREA_API = `https://apis.data.go.kr/B552584/ArpltnInforInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=${AIRKOREA_KEY}&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3`;
  const NEARBY_API = `https://apis.data.go.kr/B552584/MsrstnInfoInqireSvc/getNearbyMsrstnList?serviceKey=${AIRKOREA_KEY}&returnType=json&tmX={tmX}&tmY={tmY}`;
  const KAKAO_ADDRESS_API = `https://dapi.kakao.com/v2/local/search/address.json`;
  const KAKAO_COORD_API = `https://dapi.kakao.com/v2/local/geo/coord2address.json`;

  // PM 값 -> 상태
  function getStatus(v) {
    return CAT.find(c => v <= c.max) || CAT[CAT.length - 1];
  }

  // Gauge.js 설정
  const opts = {
    angle: 0.2,
    lineWidth: 0.2,
    radiusScale: 1,
    pointer: { length: 0.6, strokeWidth: 0.05, color: '#000' },
    colorStart: '#eee',
    colorStop: '#eee',
    strokeColor: '#eee',
    generateGradient: false,
    limitMax: true,
    limitMin: true,
    renderTicks: { divisions: 5, divWidth: 1.1, divLength: 0.7, divColor: '#333', subDivisions: 3, subLength: 0.5, subWidth: 0.6, subColor: '#666' },
    staticLabels: { font: "12px sans-serif", labels: [0, 28, 80, 146], fractionDigits: 0 }
  };
  const gaugePM10 = new Gauge(document.getElementById('gaugePM10')).setOptions(opts);
  const gaugePM25 = new Gauge(document.getElementById('gaugePM25')).setOptions(opts);
  [gaugePM10, gaugePM25].forEach(g => {
    g.maxValue = 150;
    g.setMinValue(0);
    g.animationSpeed = 32;
    g.setTextField(document.createElement('div'));
    g.canvas.on('afterRender', (canvas) => {
      const ctx = canvas.ctx;
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${g.value.toFixed(0)} µg/m³`, canvas.width / 2, canvas.height / 2);
    });
  });

  // 게이지 업데이트
  function drawGauge(pmType, value, station) {
    const gauge = pmType === 'PM10' ? gaugePM10 : gaugePM25;
    const statusEl = document.getElementById(`status${pmType}`);
    const stationEl = document.getElementById(`station${pmType}`);
    const status = getStatus(value);

    gauge.set(value);
    statusEl.textContent = status.name;
    statusEl.style.color = status.color;
    stationEl.textContent = `측정소: ${station}`;
  }

  // 에어코리아 데이터 가져오기
  async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      console.log('AirKorea URL:', url);
      const res = await fetch(url);
      console.log('AirKorea 응답 상태:', res.status);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      console.log('AirKorea 데이터:', data);
      const item = data.response.body.items[0];
      return { pm10: parseFloat(item.pm10Value) || 0, pm25: parseFloat(item.pm25Value) || 0, station };
    } catch (e) {
      console.error('AirKorea API 오류:', e);
      return { pm10: 0, pm25: 0, station };
    }
  }

  // 가까운 측정소 찾기
async function getNearestStation(lat, lon) {
    try {
      const tmUrl = `${KAKAO_COORD_API}?x=${lon}&y=${lat}`;
      console.log('Kakao TM URL:', tmUrl);
      const tmRes = await fetch(tmUrl, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao TM 응답 상태:', tmRes.status);
      if (!tmRes.ok) throw new Error(`Kakao HTTP ${tmRes.status}`);
      const tmData = await tmRes.json();
      console.log('Kakao TM 데이터:', tmData);
      const tmX = tmData.documents[0]?.address?.x || lon;
      const tmY = tmData.documents[0]?.address?.y || lat;
      console.log('TM X/Y:', tmX, tmY);

      const nearbyUrl = NEARBY_API.replace('{tmX}', tmX).replace('{tmY}', tmY);
      console.log('AirKorea Nearby URL:', nearbyUrl);
      const res = await fetch(nearbyUrl);
      console.log('AirKorea Nearby 응답 상태:', res.status);
      if (!res.ok) throw new Error(`AirKorea Nearby HTTP ${res.status}`);
      const data = await res.json();
      console.log('AirKorea Nearby 데이터:', data);
      return data.response.body.items[0]?.stationName || '서울 종로구';
    } catch (e) {
      console.error('측정소 조회 오류:', e);
      return '서울 종로구';
    }
  }

  // 전체 업데이트
async function updateAll(lat, lon) {
    console.log('위치:', lat, lon);
    const station = await getNearestStation(lat, lon);
    console.log('측정소:', station);
    const { pm10, pm25 } = await fetchAirData(station);
    console.log('PM10:', pm10, 'PM25:', pm25);
    drawGauge('PM10', pm10, station);
    drawGauge('PM25', pm25, station);
    updateRegion(lat, lon);
    updateDateTime();
  }

  // 카카오 주소 자동완성
const input = document.getElementById('place');
  const sug = document.getElementById('suggestions');
  input.addEventListener('input', async () => {
    if (!input.value) return sug.innerHTML = '';
    try {
      const q = encodeURIComponent(input.value);
      const res = await fetch(`${KAKAO_ADDRESS_API}?query=${q}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao 검색 응답 상태:', res.status);
      if (!res.ok) throw new Error(`Kakao HTTP ${res.status}`);
      const { documents } = await res.json();
      console.log('Kakao 검색 데이터:', documents);
      sug.innerHTML = '';
      documents.slice(0, 5).forEach(d => {
        const li = document.createElement('li');
        li.textContent = d.address_name;
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

  // 버튼 이벤트
  document.getElementById('searchBtn').onclick = () => {
    if (input.value) {
      const li = sug.querySelector('li');
      if (li) li.click();
    }
  };

  document.getElementById('adminBtn').onclick = () => {
    const pw = prompt('비밀번호');
    if (pw === 'leesoul0407!') location.href = 'admin.html';
  };

  // 초기화: 자동 위치
  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => {
      console.error('위치 수집 실패');
      alert('위치 수집 실패');
    }
  );

  // 시간 업데이트
  function updateDateTime() {
    document.getElementById('time').textContent = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  }
  setInterval(updateDateTime, 60000);

  // 지역 업데이트
  async function updateRegion(lat, lon) {
    try {
      const res = await fetch(`${KAKAO_COORD_API}?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      console.log('Kakao 지역 응답 상태:', res.status);
      if (!res.ok) throw new Error(`Kakao HTTP ${res.status}`);
      const { documents } = await res.json();
      console.log('Kakao 지역 데이터:', documents);
      document.getElementById('region').textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      console.error('지역 업데이트 오류:', e);
      document.getElementById('region').textContent = '--';
    }
  }
})();