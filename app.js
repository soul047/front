// app.js
(() => {
  // 카테고리 정의
  const CAT = [
    { name: '좋음', max: 28, color: '#1E88E5' },
    { name: '보통', max: 80, color: '#43A047' },
    { name: '나쁨', max: 146, color: '#F57C00' },
    { name: '매우나쁨', max: 1000, color: '#D32F2F' }
  ];

  // 에어코리아 API (실제 serviceKey 필요)
  const AIRKOREA_API = 'https://apis.data.go.kr/B552584/ArpltnInqireSvc/getMsrstnAcctoRltmMesureDnsty?serviceKey=YOUR_SERVICE_KEY&returnType=json&numOfRows=1&pageNo=1&stationName={station}&dataTerm=DAILY&ver=1.3';
  const KAKAO_KEY = 'YOUR_KAKAO_JAVASCRIPT_KEY';

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
    limitMin: true
  };
  const gaugePM10 = new Gauge(document.getElementById('gaugePM10')).setOptions(opts);
  const gaugePM25 = new Gauge(document.getElementById('gaugePM25')).setOptions(opts);
  [gaugePM10, gaugePM25].forEach(g => {
    g.maxValue = 150;
    g.setMinValue(0);
    g.animationSpeed = 32;
  });

  // 게이지 업데이트
  function drawGauge(pmType, value) {
    const gauge = pmType === 'PM10' ? gaugePM10 : gaugePM25;
    const statusEl = document.getElementById(`status${pmType}`);
    const valueEl = document.getElementById(`value${pmType}`);
    const status = getStatus(value);

    gauge.set(value);
    statusEl.textContent = status.name;
    statusEl.style.color = status.color;
    valueEl.textContent = `${value.toFixed(0)} µg/m³`;
  }

  // 에어코리아 데이터 가져오기
  async function fetchAirData(station) {
    try {
      const url = AIRKOREA_API.replace('{station}', encodeURIComponent(station));
      const res = await fetch(url);
      const data = await res.json();
      const item = data.response.body.items[0];
      return { pm10: parseFloat(item.pm10Value) || 0, pm25: parseFloat(item.pm25Value) || 0 };
    } catch (e) {
      console.error('AirKorea API 오류:', e);
      return { pm10: 0, pm25: 0 };
    }
  }

  // 측정소 찾기 (Kakao API로 위/경도 -> 주소 -> 측정소명 단순화)
  async function getNearestStation(lat, lon) {
    try {
      const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
      // 실제로는 측정소 조회 API 필요, 여기선 단순히 지역명 사용
      return documents[0]?.address?.region_2depth_name || '서울 종로구';
    } catch (e) {
      console.error('Kakao API 오류:', e);
      return '서울 종로구';
    }
  }

  // 전체 업데이트
  async function updateAll(lat, lon) {
    const station = await getNearestStation(lat, lon);
    const { pm10, pm25 } = await fetchAirData(station);
    drawGauge('PM10', pm10);
    drawGauge('PM25', pm25);
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
      const res = await fetch(`https://dapi.kakao.com/v2/local/search/address.json?query=${q}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
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

// 버튼 이벤트 (locateBtn 제거, searchBtn만 유지)
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

// 초기화: 자동 위치 (버튼 없이 직접 호출)
  navigator.geolocation.getCurrentPosition(
    p => updateAll(p.coords.latitude, p.coords.longitude),
    () => alert('위치 수집 실패')
  );

  // 시간 업데이트
  function updateDateTime() {
    document.getElementById('time').textContent = new Date().toLocaleString('ko-KR');
  }
  setInterval(updateDateTime, 60000);

  // 지역 업데이트
  async function updateRegion(lat, lon) {
    try {
      const res = await fetch(`https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}`, {
        headers: { Authorization: `KakaoAK ${KAKAO_KEY}` }
      });
      const { documents } = await res.json();
      document.getElementById('region').textContent = documents[0]?.address?.address_name || '--';
    } catch (e) {
      console.error('지역 업데이트 오류:', e);
      document.getElementById('region').textContent = '--';
    }
  }
})();